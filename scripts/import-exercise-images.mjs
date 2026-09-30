#!/usr/bin/env node
// Global egzersizlere free-exercise-db görsellerini bağlar.
//
//   node scripts/import-exercise-images.mjs --dry-run  # eşleşmeleri listeler, yazmaz
//   node scripts/import-exercise-images.mjs            # görselleri yükler, image_url yazar
//
// Gerekli ortam değişkenleri (yoksa .env / .env.production okunur):
//   SUPABASE_URL veya NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// LİSANS: free-exercise-db Unlicense (kamu malı), atıf şartı yok. wger
// (CC-BY-SA), exercises-dataset medyası ve openGym (AGPL) bilerek kullanılmadı.
//
// Eşleşme exercises.name_en ile: önce ALIASES, yoksa noktalama ve büyük harf
// farkı yok sayılarak birebir ad. Bulanık eşleşme yok; yanlış hareketin
// görselini göstermek hiç göstermemekten kötü. Kardiyo, yoga ve spor dalları
// (Running, Zumba, Warrior I) kaynakta olmadığı için görselsiz kalır.
//
// Idempotent: aynı görsel üzerine yazılır (x-upsert), image_url yeniden yazılır.
// Eşleşmeyen satırın mevcut image_url'ine dokunulmaz.

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const FEDB_COMMIT = 'f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5'
const FEDB_RAW = `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${FEDB_COMMIT}`
const BUCKET = 'exercise-images'

/**
 * Bizim name_en → free-exercise-db adı. Sadece aynı hareket ve aynı aletse
 * eklenir: "Dumbbell Hip Thrust" için barbell görseli yok sayıldı.
 */
export const ALIASES = {
  'Ab Wheel Rollout': 'Ab Roller',
  'Alternating Dumbbell Curl': 'Dumbbell Alternate Bicep Curl',
  'Arnold Press': 'Arnold Dumbbell Press',
  'Barbell Row': 'Bent Over Barbell Row',
  'Bench Press': 'Barbell Bench Press - Medium Grip',
  'Bicep Curl Machine': 'Machine Bicep Curl',
  'Box Jump': 'Front Box Jump',
  'Cable Face Pull': 'Face Pull',
  'Cable Fly': 'Cable Crossover',
  'Cable Lateral Raise': 'Cable Seated Lateral Raise',
  'Cable Overhead Tricep Extension': 'Cable Rope Overhead Triceps Extension',
  'Cable Rope Pushdown': 'Triceps Pushdown - Rope Attachment',
  'Cable Row': 'Seated Cable Rows',
  'Cable Wood Chop': 'Standing Cable Wood Chop',
  'Calf Raise': 'Standing Calf Raises',
  'Calf Stretch': 'Calf Stretch Hands Against Wall',
  'Cat-Cow': 'Cat Stretch',
  'Cat-Cow Stretch': 'Cat Stretch',
  'Chest Press Machine': 'Leverage Chest Press',
  'Chest Supported Dumbbell Row': 'Dumbbell Incline Row',
  'Childs Pose': "Child's Pose",
  'Close Grip Bench': 'Close-Grip Barbell Bench Press',
  'Close Grip Lat Pulldown': 'Close-Grip Front Lat Pulldown',
  'Concentration Curl': 'Concentration Curls',
  'Crunch': 'Crunches',
  'Deadlift': 'Barbell Deadlift',
  'Diamond Push-Up': 'Push-Ups - Close Triceps Position',
  'Dips': 'Dips - Triceps Version',
  'Donkey Calf Raise': 'Donkey Calf Raises',
  'Dumbbell Arnold Press': 'Arnold Dumbbell Press',
  'Dumbbell Calf Raise': 'Standing Dumbbell Calf Raise',
  'Dumbbell Curl': 'Dumbbell Bicep Curl',
  'Dumbbell Decline Bench Press': 'Decline Dumbbell Bench Press',
  'Dumbbell Flat Bench Press': 'Dumbbell Bench Press',
  'Dumbbell Fly': 'Dumbbell Flyes',
  'Dumbbell Front Raise': 'Front Dumbbell Raise',
  'Dumbbell Goblet Squat': 'Goblet Squat',
  'Dumbbell Incline Bench Press': 'Incline Dumbbell Press',
  'Dumbbell Lateral Raise': 'Side Lateral Raise',
  'Dumbbell Overhead Tricep Extension': 'Standing Dumbbell Triceps Extension',
  'Dumbbell Pullover': 'Bent-Arm Dumbbell Pullover',
  'Dumbbell Rear Delt Fly': 'Seated Bent-Over Rear Delt Raise',
  'Dumbbell Reverse Lunge': 'Dumbbell Rear Lunge',
  'Dumbbell Romanian Deadlift': 'Stiff-Legged Dumbbell Deadlift',
  'Dumbbell Row': 'One-Arm Dumbbell Row',
  'Dumbbell Step-Up': 'Dumbbell Step Ups',
  'Dumbbell Sumo Squat': 'Plie Dumbbell Squat',
  'Dumbbell Tate Press': 'Tate Press',
  'Dumbbell Tricep Kickback': 'Tricep Dumbbell Kickback',
  'Dumbbell Upright Row': 'Standing Dumbbell Upright Row',
  'Elliptical': 'Elliptical Trainer',
  'Front Raise': 'Front Dumbbell Raise',
  'Glute Bridge': 'Butt Lift (Bridge)',
  'Hammer Curl': 'Hammer Curls',
  'Handstand Push-Up': 'Handstand Push-Ups',
  'High to Low Cable Fly': 'Cable Crossover',
  'Hip Abduction Machine': 'Thigh Abductor',
  'Hip Adduction Machine': 'Thigh Adductor',
  'Hip Flexor Stretch': 'Kneeling Hip Flexor',
  'Hip Thrust': 'Barbell Hip Thrust',
  'Hyperextension': 'Hyperextensions (Back Extensions)',
  'Incline Bench Press': 'Barbell Incline Bench Press - Medium Grip',
  'Incline Chest Press Machine': 'Leverage Incline Chest Press',
  'Iso Lateral Row Machine': 'Leverage Iso Row',
  'IT Band Stretch': 'IT Band and Glute Stretch',
  'Jump Rope': 'Rope Jumping',
  'Jump Squat': 'Freehand Jump Squat',
  'Lat Pulldown': 'Wide-Grip Lat Pulldown',
  'Lateral Raise': 'Side Lateral Raise',
  'Leg Curl': 'Lying Leg Curls',
  'Leg Extension': 'Leg Extensions',
  'Leg Raise': 'Flat Bench Lying Leg Raise',
  'Low to High Cable Fly': 'Low Cable Crossover',
  'Lying Leg Curl Machine': 'Lying Leg Curls',
  'Mountain Climber': 'Mountain Climbers',
  'Neck Stretch': 'Side Neck Stretch',
  'One-Arm Push-Up': 'Single-Arm Push-Up',
  'Overhead Press': 'Standing Military Press',
  'Pec Deck': 'Butterfly',
  'Pull-Up': 'Pullups',
  'Push-Up': 'Pushups',
  'Rear Delt Fly': 'Reverse Flyes',
  'Reverse Grip Lat Pulldown': 'Underhand Cable Pulldowns',
  'Rowing Machine': 'Rowing, Stationary',
  'Seated Dumbbell Shoulder Press': 'Seated Dumbbell Press',
  'Seated Leg Curl Machine': 'Seated Leg Curl',
  'Shoulder Press Machine': 'Machine Shoulder (Military) Press',
  'Shrug': 'Barbell Shrug',
  'Side Plank': 'Side Bridge',
  'Single Arm Dumbbell Overhead Extension': 'Dumbbell One-Arm Triceps Extension',
  'Single Arm Dumbbell Row': 'One-Arm Dumbbell Row',
  'Skull Crusher': 'EZ-Bar Skullcrusher',
  'Smith Machine Incline Press': 'Smith Machine Incline Bench Press',
  'Smith Machine Romanian Deadlift': 'Smith Machine Stiff-Legged Deadlift',
  'Smith Machine Shoulder Press': 'Smith Machine Overhead Shoulder Press',
  'Spin / Indoor Cycling': 'Bicycling, Stationary',
  'Squat': 'Barbell Squat',
  'Stair Climbing': 'Stairmaster',
  'Standing Calf Raise Machine': 'Standing Calf Raises',
  'T-Bar Row': 'T-Bar Row with Handle',
  'Treadmill': 'Running, Treadmill',
  'Tricep Extension Machine': 'Machine Triceps Extension',
  'Tricep Pushdown': 'Triceps Pushdown',
  'Turkish Get-Up': 'Kettlebell Turkish Get-Up (Squat style)',
  'Upright Row': 'Upright Barbell Row',
  'Wide Push-Up': 'Push-Up Wide',
  'World Greatest Stretch': "World's Greatest Stretch",
}

/** "Push-Up", "push up" ve "PUSH UP" aynı anahtara düşer. */
export function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * exercises: { id, name_en }[], catalog: free-exercise-db kayıtları.
 * Görseli olmayan katalog kaydı yok sayılır. brokenAliases: kataloğun bu
 * sürümünde karşılığı olmayan takma adlar (kaynak ad değiştirdiyse).
 */
export function matchExercises(exercises, catalog, aliases = ALIASES) {
  const byName = new Map()
  for (const entry of catalog) {
    if (Array.isArray(entry.images) && entry.images.length > 0) byName.set(normalizeName(entry.name), entry)
  }
  const aliasMap = new Map(Object.entries(aliases).map(([ours, theirs]) => [normalizeName(ours), normalizeName(theirs)]))
  const brokenAliases = Object.keys(aliases).filter((ours) => !byName.has(aliasMap.get(normalizeName(ours))))

  const matched = []
  const unmatched = []
  for (const exercise of exercises) {
    const key = exercise.name_en ? normalizeName(exercise.name_en) : ''
    const entry = key ? byName.get(aliasMap.get(key) ?? key) : undefined
    if (entry) matched.push({ exercise, entry })
    else unmatched.push(exercise)
  }
  return { matched, unmatched, brokenAliases }
}

/** Kovadaki yol kaynaktakiyle aynı: "Pushups/0.jpg". */
export function publicImageUrl(supabaseUrl, imagePath) {
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${BUCKET}/${imagePath}`
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

  const catalog = await (await fetchOk(`${FEDB_RAW}/dist/exercises.json`)).json()
  const exercises = await (await fetchOk(`${supabaseUrl}/rest/v1/exercises?select=id,name_en&user_id=is.null&order=name_en`, { headers: auth })).json()
  const { matched, unmatched, brokenAliases } = matchExercises(exercises, catalog)
  const images = new Set(matched.map((m) => m.entry.images[0]))

  console.log(`Katalog: ${catalog.length} kayıt (free-exercise-db @ ${FEDB_COMMIT.slice(0, 7)})`)
  console.log(`Global egzersiz: ${exercises.length}, eşleşen: ${matched.length}, eşleşmeyen: ${unmatched.length}, yüklenecek görsel: ${images.size}`)
  if (brokenAliases.length) console.warn(`Kaynakta bulunamayan takma adlar: ${brokenAliases.join(', ')}`)
  if (dryRun) {
    for (const { exercise, entry } of matched) console.log(`  ✓ ${exercise.name_en} → ${entry.name}`)
    console.log(`Görselsiz kalacaklar: ${unmatched.map((e) => e.name_en ?? `(name_en yok: ${e.id})`).join(', ')}`)
    return
  }

  const urls = new Map()
  let failed = 0
  for (const { exercise, entry } of matched) {
    const path = entry.images[0]
    try {
      if (!urls.has(path)) {
        const body = await (await fetchOk(`${FEDB_RAW}/exercises/${path}`)).arrayBuffer()
        await fetchOk(`${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`, {
          method: 'POST',
          headers: { ...auth, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
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
