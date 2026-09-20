import * as SecureStore from 'expo-secure-store'
import { createMobileClient } from '@lifeos/shared/supabase'

const SECURE_STORE_CHUNK_SIZE = 512
const CHUNK_MANIFEST_PREFIX = 'lifeos-chunks:'
/** Çıkışta süpürülecek parça sayısı: manifeste hiç girmemiş artıklar için üst sınır. */
const ORPHAN_SWEEP_CHUNKS = 24

/**
 * Anahtar başına iş sırası. Supabase oturumu aynı anda iki yerden yazılabiliyor
 * (arka planda token yenileme + öndeki setSession). İki yazım paralel koşarsa
 * ikisi de "öbür nesil"i seçer, parçaları birbirine karışır ve manifest en sona
 * yazıldığı için ortaya iki oturumdan derlenmiş, okunamayan bir değer çıkar.
 * Tek çalışma zamanındayız, bu yüzden basit bir söz zinciri yeter: her iş
 * aynı anahtardaki bir öncekinin bitmesini bekler.
 */
const queues = new Map<string, Promise<unknown>>()

function enqueue<T>(key: string, job: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve()
  const next = previous.then(job, job)
  queues.set(key, next)
  // Sıra boşalınca girdiyi bırak; uzun oturumda Map büyümesin.
  void next.then(
    () => { if (queues.get(key) === next) queues.delete(key) },
    () => { if (queues.get(key) === next) queues.delete(key) },
  )
  return next
}

/**
 * Parçaların nesli. Yeni değer HER ZAMAN öbür nesle yazılır, böylece yazım
 * yarıda kalırsa (işletim sistemi uygulamayı öldürdü, kullanıcı kapattı)
 * yürürlükteki manifest hâlâ eksiksiz eski parçaları gösterir. Manifest en son
 * yazılır ve tek adımda değiştiği için okuma ya tamamen eski ya tamamen yeni
 * değeri görür; ikisinin karışımı oluşamaz.
 *
 * İki nesil yeter: yeni manifest yazıldıktan SONRA eski nesil silinir, yani
 * bir sonraki yazımda o nesil zaten boştur.
 */
type Generation = 'a' | 'b'

interface Manifest {
  count: number
  /** null: nesil öncesi biçim (`lifeos-chunks:3`), parçalar `.chunk.N` anahtarlarında. */
  generation: Generation | null
}

function chunkKey(key: string, generation: Generation | null, index: number): string {
  return generation === null ? `${key}.chunk.${index}` : `${key}.c${generation}.${index}`
}

function parseManifest(value: string | null): Manifest | null {
  if (!value?.startsWith(CHUNK_MANIFEST_PREFIX)) return null

  const [rawCount, rawGeneration] = value.slice(CHUNK_MANIFEST_PREFIX.length).split(':')
  const count = Number.parseInt(rawCount ?? '', 10)
  if (!Number.isSafeInteger(count) || count <= 0) return null

  return {
    count,
    generation: rawGeneration === 'a' || rawGeneration === 'b' ? rawGeneration : null,
  }
}

function nextGeneration(previous: Manifest | null): Generation {
  return previous?.generation === 'a' ? 'b' : 'a'
}

/** Bir neslin parçalarını siler. Hata yutulur: manifest zaten onları göstermiyor. */
async function deleteChunks(key: string, manifest: Manifest | null): Promise<void> {
  if (manifest === null) return
  await Promise.all(
    Array.from({ length: manifest.count }, (_, index) =>
      SecureStore.deleteItemAsync(chunkKey(key, manifest.generation, index)).catch(() => undefined),
    ),
  )
}

async function readValue(key: string): Promise<string | null> {
  const stored = await SecureStore.getItemAsync(key)
  const manifest = parseManifest(stored)
  if (manifest === null) return stored

  const chunks = await Promise.all(
    Array.from({ length: manifest.count }, (_, index) =>
      SecureStore.getItemAsync(chunkKey(key, manifest.generation, index)),
    ),
  )

  return chunks.every((chunk): chunk is string => chunk !== null)
    ? chunks.join('')
    : null
}

async function writeValue(key: string, value: string): Promise<void> {
  const previous = parseManifest(await SecureStore.getItemAsync(key))

  if (value.length <= SECURE_STORE_CHUNK_SIZE) {
    await SecureStore.setItemAsync(key, value)
    await deleteChunks(key, previous)
    return
  }

  const generation = nextGeneration(previous)
  const chunks = Array.from(
    { length: Math.ceil(value.length / SECURE_STORE_CHUNK_SIZE) },
    (_, index) => value.slice(
      index * SECURE_STORE_CHUNK_SIZE,
      (index + 1) * SECURE_STORE_CHUNK_SIZE,
    ),
  )

  // Sıra önemli: önce yeni neslin parçaları, sonra manifest, en son eski nesil.
  await Promise.all(
    chunks.map((chunk, index) => SecureStore.setItemAsync(chunkKey(key, generation, index), chunk)),
  )
  await SecureStore.setItemAsync(key, `${CHUNK_MANIFEST_PREFIX}${chunks.length}:${generation}`)
  await deleteChunks(key, previous)
}

/**
 * Çıkışta manifest ve İKİ neslin parçaları birden silinir.
 *
 * Manifest yalnızca yürürlükteki nesli gösterir; yarıda kalmış bir yazımın
 * parçaları ya da nesil öncesi biçim orada hiç görünmez. Sadece manifesti
 * izleyip silmek, cihazda okunmayan ama duran oturum parçaları bırakıyordu.
 */
async function clearValue(key: string): Promise<void> {
  const manifest = parseManifest(await SecureStore.getItemAsync(key))
  await SecureStore.deleteItemAsync(key)

  const count = Math.max(manifest?.count ?? 0, ORPHAN_SWEEP_CHUNKS)
  const generations: (Generation | null)[] = ['a', 'b', null]
  await Promise.all(generations.map((generation) => deleteChunks(key, { count, generation })))
}

// Supabase oturumları 2 KB SecureStore sınırını aşabildiği için değerler
// küçük, güvenli parçalar hâlinde saklanır. Eski tek-parça oturumlar okunmaya
// devam eder; ilk yenilemede otomatik olarak yeni biçime taşınır. Üç işlem de
// aynı anahtarda sıraya girer: araya giren bir yazım bütünlüğü bozamaz.
const secureStoreAdapter = {
  getItem(key: string): Promise<string | null> {
    return enqueue(key, () => readValue(key))
  },

  setItem(key: string, value: string): Promise<void> {
    return enqueue(key, () => writeValue(key, value))
  },

  removeItem(key: string): Promise<void> {
    return enqueue(key, () => clearValue(key))
  },
}

export const supabase = createMobileClient(secureStoreAdapter)
