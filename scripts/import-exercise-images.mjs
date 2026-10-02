#!/usr/bin/env node
// Global egzersizlere RepDB çizimlerini bağlar.
//
//   node scripts/import-exercise-images.mjs --dry-run  # eşleşmeleri listeler, yazmaz
//   node scripts/import-exercise-images.mjs            # kovaya yükler, image_url yazar
//
// Gerekli ortam değişkenleri (yoksa .env / .env.production okunur):
//   SUPABASE_URL veya NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// LİSANS: RepDB Free Tier License v1.0 (depodaki LICENSE-DATA.md, aşağıdaki
// commit). Uygulama içinde ticari kullanım serbest, şartları:
//   1. Görünür atıf: "Exercise data by RepDB (repdb.co)". Mobilde profildeki
//      Veri Kaynakları kartında (DataSourcesCard.tsx); kaldırma.
//   2. Veri seti olarak yeniden yayın yasak. Bu repo public: exercises.json ve
//      görseller repoya COMMIT EDİLMEZ, script çalışırken indirir ve yalnızca
//      kovaya yükler.
//   3. Görseller üretken yapay zekâya girdi yapılamaz.
//   4. premium-samples/ yalnızca değerlendirme içindir, kullanılmaz.
// Eski kaynak free-exercise-db'nin fotoğraflarının ticari kullanım hakkı yoktu,
// 2026-10-01'de hepsi kaldırıldı; geri getirme.
//
// Eşleşme exercises.name_en ile: önce ALIASES, yoksa noktalama ve büyük harf
// farkı yok sayılarak birebir ad. Bulanık eşleşme yok; yanlış hareketin
// görselini göstermek hiç göstermemekten kötü. Adı aynı ama aleti farklı olan
// hareketler SKIP'te. Yüzme, yoga akışları ve spor dalları kaynakta yok,
// görselsiz kalır; detay sayfası o zaman kategori ikonunu gösterir.
//
// Idempotent: aynı görsel üzerine yazılır (x-upsert), image_url yeniden yazılır.
// Eşleşmeyen satırın mevcut image_url'ine dokunulmaz.

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPDB_COMMIT = '9ed9357f09c7566ea0256c57ebd6374ebb8b575e'
const REPDB_RAW = `https://raw.githubusercontent.com/RepDB/exercise-dataset/${REPDB_COMMIT}`
const BUCKET = 'exercise-images'

/**
 * Bizim name_en → RepDB name_en. Sadece aynı hareket ve aynı aletse eklenir:
 * "Dumbbell Goblet Squat" için kettlebell görseli yok sayıldı.
 */
export const ALIASES = {
  'Ab Crunch Machine': 'Machine Seated Crunch',
  'Alternating Dumbbell Curl': 'Dumbbell Bicep Curl',
  'Assisted Dip Machine': 'Machine Assisted Dips',
  'Assisted Pull-Up Machine': 'Assisted Pull Ups',
  'Barbell Row': 'Bent-Over Barbell Row',
  'Bench Press': 'Barbell Bench Press',
  'Bicep Curl Machine': 'Machine Bicep Curl',
  'Brisk Walking': 'Walking',
  'Burpee': 'Burpees',
  'Cable Crossover': 'Cable Fly',
  'Cable EZ Curl': 'Cable Curl',
  'Cable Row': 'Seated Cable Row',
  'Calf Raise': 'Machine Calf Raise',
  'Calf Stretch': 'Standing Calf Stretch',
  'Cat-Cow Stretch': 'Cat-Cow',
  'Chest Press Machine': 'Machine Chest Press',
  'Chest Stretch': 'Doorway Chest Stretch',
  'Chest Supported Row': 'Chest-Supported Dumbbell Row',
  'Childs Pose': "Child's Pose",
  'Chin-Up': 'Chin-Ups',
  'Close Grip Bench': 'Close-Grip Bench Press',
  'Cobra Pose': 'Cobra Stretch',
  'Crunch': 'Crunches',
  'Deadlift': 'Barbell Deadlift',
  'Dips': 'Chest Dips',
  'Downward Dog': 'Downward-Facing Dog',
  'Dumbbell Arnold Press': 'Arnold Press',
  'Dumbbell Bulgarian Split Squat': 'Bulgarian Split Squat',
  'Dumbbell Curl': 'Dumbbell Bicep Curl',
  'Dumbbell Decline Bench Press': 'Decline Bench Press',
  'Dumbbell Flat Bench Press': 'Dumbbell Bench Press',
  'Dumbbell Incline Bench Press': 'Incline Dumbbell Press',
  'Dumbbell Overhead Tricep Extension': 'Overhead Tricep Extension',
  'Dumbbell Rear Delt Fly': 'Rear Delt Fly',
  'Dumbbell Reverse Lunge': 'Reverse Lunge',
  'Dumbbell Row': 'Single-Arm Dumbbell Row',
  'Dumbbell Walking Lunge': 'Dumbbell Lunge',
  'Elevated Push-Up': 'Incline Push-Up',
  'Elliptical': 'Elliptical Trainer',
  'Face Pull': 'Cable Face Pull',
  'Front Raise': 'Dumbbell Front Raise',
  'Hammer Curl': 'Dumbbell Hammer Curl',
  'Hip Abduction Machine': 'Machine Hip Abduction',
  'Hip Adduction Machine': 'Hip Adduction',
  'Hip Flexor Stretch': 'Kneeling Hip Flexor Stretch',
  'Hip Thrust': 'Barbell Hip Thrust',
  'Hyperextension': 'Back Extension',
  'Incline Bench Press': 'Incline Barbell Bench Press',
  'Lateral Raise': 'Dumbbell Lateral Raise',
  'Lateral Raise Machine': 'Plate-Loaded Lateral Raise',
  'Leg Curl': 'Lying Leg Curl',
  'Leg Raise': 'Lying Leg Raise',
  'Lizard Pose': 'Lizard Stretch',
  'Lunges': 'Lunge',
  'Lying Leg Curl Machine': 'Lying Leg Curl',
  'Mountain Climber': 'Mountain Climbers',
  'Muscle-Up': 'Muscle Ups',
  'Neck Stretch': 'Neck Side Stretch',
  'Overhead Press': 'Barbell Overhead Press',
  'Overhead Tricep Ext': 'Overhead Tricep Extension',
  'Pallof Press': 'Cable Pallof Press',
  'Pigeon Pose': 'Pigeon Stretch',
  'Pike Push-Up': 'Pike Push Ups',
  'Preacher Curl': 'Barbell Preacher Curl',
  'Quad Stretch': 'Standing Quad Stretch',
  'Reverse Lunge': 'Bodyweight Reverse Lunge',
  'Seated Leg Curl Machine': 'Seated Leg Curl',
  'Shoulder Press Machine': 'Machine Shoulder Press',
  'Shoulder Stretch': 'Cross-Body Shoulder Stretch',
  'Shrug': 'Dumbbell Shrug',
  'Single Arm Dumbbell Overhead Extension': 'Single-Arm Dumbbell Overhead Tricep Extension',
  'Smith Machine Incline Press': 'Smith Machine Incline Bench Press',
  'Spin / Indoor Cycling': 'Stationary Bike',
  'Squat': 'Barbell Back Squat',
  'Squat Hold (Wall Sit)': 'Wall Sit',
  'Standing Calf Raise Machine': 'Standing Calf Raise',
  'Standing Dumbbell Press': 'Dumbbell Shoulder Press',
  'Step-Up': 'Step Ups',
  'Trap Bar Deadlift': 'Hex Bar Deadlift',
  'Treadmill': 'Treadmill Running',
  'Tricep Extension Machine': 'Machine Triceps Extension',
  'Tricep Pushdown': 'Cable Tricep Pushdown',
  'Turkish Get-Up': 'Kettlebell Turkish Get Ups',
  'Upright Row': 'Barbell Upright Row',
}

/**
 * Adı RepDB'dekiyle aynı ama aleti farklı: bizde vücut ağırlığı ya da başka
 * alet, RepDB çiziminde dambıl, kettlebell, GHD veya dip istasyonu var.
 */
export const SKIP = [
  'Bulgarian Split Squat',
  'Goblet Squat',
  'Inverted Row',
  'L-Sit',
  'Nordic Hamstring Curl',
]

/**
 * RepDB'de hareketlerin çoğunda başlangıç (start) ve tepe (peak) pozu, tek
 * pozlu olanlarda (kardiyo, esneme) main var. Varsayılan peak: hareketi en iyi
 * anlatan an. Peak hareketi anlatmıyorsa burada RepDB adıyla start seçilir.
 */
export const POSES = {}

/** Seçilen poz yoksa main'e, o da yoksa start'a düşer. */
export function imagePathFor(entry, poses = POSES) {
  const flat = entry.images?.flat ?? {}
  return flat[poses[entry.name_en] ?? 'peak'] ?? flat.main ?? flat.start
}

/** "Push-Up", "push up" ve "PUSH UP" aynı anahtara düşer. */
export function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * exercises: { id, name_en }[], catalog: RepDB kayıtları. Görseli olmayan
 * katalog kaydı yok sayılır. brokenAliases: kataloğun bu sürümünde karşılığı
 * olmayan takma adlar (kaynak ad değiştirdiyse). SKIP'teki adlar hiç eşleşmez.
 */
export function matchExercises(exercises, catalog, aliases = ALIASES, skip = SKIP) {
  const byName = new Map()
  for (const entry of catalog) {
    if (entry.name_en && imagePathFor(entry, {})) byName.set(normalizeName(entry.name_en), entry)
  }
  const skipped = new Set(skip.map(normalizeName))
  const aliasMap = new Map(Object.entries(aliases).map(([ours, theirs]) => [normalizeName(ours), normalizeName(theirs)]))
  const brokenAliases = Object.keys(aliases).filter((ours) => !byName.has(aliasMap.get(normalizeName(ours))))

  const matched = []
  const unmatched = []
  for (const exercise of exercises) {
    const key = exercise.name_en ? normalizeName(exercise.name_en) : ''
    const entry = key && !skipped.has(key) ? byName.get(aliasMap.get(key) ?? key) : undefined
    if (entry) matched.push({ exercise, entry })
    else unmatched.push(exercise)
  }
  return { matched, unmatched, brokenAliases }
}

/** Kovada klasörsüz dosya adı: "images/flat/push-up-peak.webp" → "push-up-peak.webp". */
export function bucketPath(imagePath) {
  return imagePath.split('/').pop()
}

export function publicImageUrl(supabaseUrl, imagePath) {
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${BUCKET}/${bucketPath(imagePath)}`
}

// ============================
// Çalıştırma
// ============================

function loadEnvFile(root, name) {
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

async function fetchOk(url, init) {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url} → ${res.status} ${await res.text()}`)
  return res
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const env = { ...loadEnvFile(root, '.env.production'), ...loadEnvFile(root, '.env'), ...process.env }
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    console.error('SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli.')
    process.exit(1)
  }
  const auth = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }

  const catalog = (await (await fetchOk(`${REPDB_RAW}/exercises.json`)).json()).exercises
  const exercises = await (await fetchOk(`${supabaseUrl}/rest/v1/exercises?select=id,name_en&user_id=is.null&order=name_en`, { headers: auth })).json()
  const { matched, unmatched, brokenAliases } = matchExercises(exercises, catalog)
  const images = new Set(matched.map((m) => imagePathFor(m.entry)))

  console.log(`Katalog: ${catalog.length} kayıt (RepDB @ ${REPDB_COMMIT.slice(0, 7)})`)
  console.log(`Global egzersiz: ${exercises.length}, eşleşen: ${matched.length}, eşleşmeyen: ${unmatched.length}, yüklenecek görsel: ${images.size}`)
  // Kaynak sabit bir commit; kırık takma ad tablodaki yazım hatasıdır, sessizce görselsiz bırakma.
  if (brokenAliases.length) {
    console.error(`Kaynakta bulunamayan takma adlar: ${brokenAliases.join(', ')}`)
    process.exit(1)
  }
  if (dryRun) {
    for (const { exercise, entry } of matched) console.log(`  ✓ ${exercise.name_en} → ${entry.name_en} (${bucketPath(imagePathFor(entry))})`)
    console.log(`Görselsiz kalacaklar: ${unmatched.map((e) => e.name_en ?? `(name_en yok: ${e.id})`).join(', ')}`)
    return
  }

  const urls = new Map()
  let failed = 0
  for (const { exercise, entry } of matched) {
    const path = imagePathFor(entry)
    try {
      if (!urls.has(path)) {
        const body = await (await fetchOk(`${REPDB_RAW}/${path}`)).arrayBuffer()
        await fetchOk(`${supabaseUrl}/storage/v1/object/${BUCKET}/${bucketPath(path)}`, {
          method: 'POST',
          headers: { ...auth, 'Content-Type': 'image/webp', 'x-upsert': 'true' },
          body,
        })
        urls.set(path, publicImageUrl(supabaseUrl, path))
      }
      await fetchOk(`${supabaseUrl}/rest/v1/exercises?id=eq.${exercise.id}`, {
        method: 'PATCH',
        headers: { ...auth, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ image_url: urls.get(path) }),
      })
    } catch (err) {
      failed++
      console.error(`  ✗ ${exercise.name_en}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  console.log(`Yazılan: ${matched.length - failed}, hata: ${failed}`)
  if (failed > 0) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
