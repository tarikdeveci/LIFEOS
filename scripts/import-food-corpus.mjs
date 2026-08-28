// USDA FoodData Central referans satırlarını food_corpus tablosuna yükler.
//
//   node scripts/import-food-corpus.mjs
//
// Gerekli ortam değişkenleri (yoksa .env / .env.production okunur):
//   SUPABASE_URL veya NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Veri: supabase/data/food-corpus.json — 13.339 satır, 100 g başına değerler.
// Kaynak setler: SR Legacy (2018), Survey/FNDDS (2021-23), Foundation (2025).
// USDA FDC verisi public domain'dir.
//
// Idempotent: aynı fdc_id tekrar yüklenirse üzerine yazar (merge-duplicates).

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const DATA_PATH = resolve(root, 'supabase/data/food-corpus.json')
// 500'lük partiler PostgREST bağlantısını zaman zaman düşürüyordu ("fetch failed").
// 250 satır ~50 KB gövde demek; parti başına yeniden deneme ile birlikte güvenli.
const BATCH_SIZE = 250
const MAX_ATTEMPTS = 6
// Partiler arası kısa nefes: arka arkaya onlarca istek PostgREST bağlantısını
// düşürüyordu. Upsert idempotent olduğu için yarıda kalan yükleme yeniden
// çalıştırıldığında kaldığı yerden tamamlanır.
const BATCH_PAUSE_MS = 200

function loadEnvFile(name) {
  const path = resolve(root, name)
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!match) continue
    out[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const fileEnv = { ...loadEnvFile('.env.production'), ...loadEnvFile('.env') }
const env = { ...fileEnv, ...process.env }

const SUPABASE_URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli.')
  process.exit(1)
}

/** SQL tarafındaki arama bunun üstünden yapılır; küçük harf, noktalamasız. */
function searchText(description) {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9%\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function toRow(fdcId, entry) {
  return {
    fdc_id: String(fdcId),
    description: entry.n,
    search_text: searchText(entry.n),
    dataset: entry.d,
    kcal: Number(entry.k) || 0,
    protein: Number(entry.p) || 0,
    carbs: Number(entry.c) || 0,
    fat: Number(entry.f) || 0,
    fiber: Number(entry.fi) || 0,
    measure_grams: Array.isArray(entry.g) ? entry.g.filter((g) => Number(g) > 0) : [],
  }
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/** Yeniden denemenin düzeltemeyeceği hata (4xx): doğrudan yukarı taşınır. */
class PermanentError extends Error {}

/**
 * Tek partiyi yükler. Ağ hatası ve 5xx geçici sayılır ve artan bekleme ile
 * yeniden denenir; 4xx kalıcı hata olarak hemen fırlatılır. Upsert idempotent
 * olduğu için yeniden deneme satırları çoğaltmaz.
 */
async function upsertBatch(rows) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/food_corpus`, {
        method: 'POST',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(rows),
      })

      if (response.ok) return
      const detail = `${response.status} ${response.statusText}: ${await response.text()}`
      // İstemci hatası tekrar denemekle düzelmez.
      if (response.status < 500) throw new PermanentError(detail)
      if (attempt >= MAX_ATTEMPTS) throw new Error(detail)
    } catch (error) {
      if (error instanceof PermanentError || attempt >= MAX_ATTEMPTS) throw error
    }
    await sleep(attempt * 1000)
  }
}

async function main() {
  if (!existsSync(DATA_PATH)) {
    console.error(`Veri dosyası yok: ${DATA_PATH}`)
    process.exit(1)
  }

  const corpus = JSON.parse(readFileSync(DATA_PATH, 'utf8'))
  const rows = Object.entries(corpus)
    .map(([id, entry]) => toRow(id, entry))
    .filter((row) => row.description && row.search_text)

  console.log(`${rows.length} satır yüklenecek (${Math.ceil(rows.length / BATCH_SIZE)} parti)`)

  let done = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    await upsertBatch(batch)
    done += batch.length
    process.stdout.write(`\r  ${done}/${rows.length}`)
    await sleep(BATCH_PAUSE_MS)
  }

  console.log('\nTamamlandı.')
}

main().catch((error) => {
  console.error('\nYükleme başarısız:', error.message)
  process.exit(1)
})
