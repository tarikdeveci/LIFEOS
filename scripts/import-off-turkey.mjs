// Open Food Facts'ten Türkiye paketli ürünlerini food_corpus'a yükler.
//
//   node scripts/import-off-turkey.mjs            # indir, süz, yükle
//   node scripts/import-off-turkey.mjs --dry-run  # yükleme, sadece say
//
// Gerekli ortam değişkenleri (yoksa .env / .env.production okunur):
//   SUPABASE_URL veya NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// USDA korpusu paketli Türk ürünü içermez (Sütaş yoğurt, Torku salam, Migros
// süt). Bu boşluğu Open Food Facts kapatıyor. Satırlar dataset='off' etiketiyle
// girer; küratörsüz kaynaklar için konmuş 0.6 güven tavanı böylece uygulanır.
//
// LİSANS: Open Food Facts verisi ODbL altındadır — atıf ve türev veri tabanında
// share-alike zorunlu. dataset='off' etiketi bu satırların ayrıştırılabilir
// kalmasını sağlar. https://opendatacommons.org/licenses/odbl/
//
// Idempotent: aynı barkod tekrar yüklenirse üzerine yazar (merge-duplicates).

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import { createGunzip } from 'node:zlib'
import https from 'node:https'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const DUMP_URL = 'https://openfoodfacts-ds.s3.eu-west-3.amazonaws.com/en.openfoodfacts.org.products.csv.gz'
const BATCH_SIZE = 250
const BATCH_PAUSE_MS = 200
const MAX_ATTEMPTS = 6
const DRY_RUN = process.argv.includes('--dry-run')

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

const env = { ...loadEnvFile('.env.production'), ...loadEnvFile('.env'), ...process.env }
const SUPABASE_URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_KEY)) {
  console.error('SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli (ya da --dry-run).')
  process.exit(1)
}

// ============================
// Katlama
// ============================
// _shared/nutrition/normalize.ts içindeki fold() ile AYNI olmak zorunda: sorgu
// tarafı "yoğurt"u "yogurt"a katlıyor, search_text de katlanmazsa eşleşme olmaz.
const FOLD_MAP = {
  ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g',
  ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c',
  â: 'a', î: 'i', û: 'u', é: 'e', è: 'e', á: 'a', ñ: 'n',
}

function fold(input) {
  const lowered = input.toLocaleLowerCase('tr')
  let out = ''
  for (const ch of lowered) out += FOLD_MAP[ch] ?? ch
  return out
}

function searchText(description) {
  return fold(description).replace(/[^a-z0-9%\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

// ============================
// Süzme ve kalite kapısı
// ============================

/** "35 g", "250 ml", "5 pieces (30 g)" → 35 / 250 / 30. Bulunamazsa null. */
function servingGrams(text) {
  if (!text) return null
  const match = fold(text).match(/(\d+(?:[.,]\d+)?)\s*(g|gr|gram|ml)\b/)
  if (!match) return null
  const value = parseFloat(match[1].replace(',', '.'))
  return Number.isFinite(value) && value > 0 && value <= 2000 ? value : null
}

/**
 * Open Food Facts kitle kaynaklıdır: sıfır kalorili çikolata, makrosu boş
 * satır, toplamı 100 g'ı aşan makro gibi kayıtlar içerir. Atwater kontrolü
 * (4P + 4C + 9F) beyan edilen kaloriyle makroların tutarlı olmasını şart koşar.
 * Ölçüm: 1224 ham satırın 63'ü buradan eleniyor.
 */
function passesQualityGate(row) {
  const { kcal, p, c, f } = row
  if (!Number.isFinite(kcal) || kcal < 0 || kcal > 900) return false
  if (p === 0 && c === 0 && f === 0) return false
  if (p + c + f > 100) return false
  const atwater = 4 * p + 4 * c + 9 * f
  if (atwater > 0 && Math.abs(atwater - kcal) / Math.max(kcal, 1) > 0.30) return false
  return true
}

const COLUMNS = [
  'code', 'product_name', 'brands', 'countries_tags', 'serving_size',
  'energy-kcal_100g', 'proteins_100g', 'carbohydrates_100g', 'fat_100g', 'fiber_100g',
]

async function fetchAndFilter() {
  const response = await new Promise((ok, err) =>
    https.get(DUMP_URL, { headers: { 'User-Agent': 'LifeOS/1.0 (nutrition app)' } }, ok).on('error', err))

  if (response.statusCode !== 200) throw new Error(`dump indirilemedi: HTTP ${response.statusCode}`)
  console.log(`dump indiriliyor (${Math.round(Number(response.headers['content-length']) / 1e6)} MB)...`)

  const lines = createInterface({ input: response.pipe(createGunzip()), crlfDelay: Infinity })
  const rows = []
  const stats = { total: 0, turkey: 0, rejected: 0 }
  let idx = null

  for await (const line of lines) {
    if (idx === null) {
      const header = line.split('\t')
      idx = Object.fromEntries(COLUMNS.map((name) => [name, header.indexOf(name)]))
      const missing = COLUMNS.filter((name) => idx[name] < 0)
      if (missing.length > 0) throw new Error(`dump şeması değişmiş, eksik sütun: ${missing.join(', ')}`)
      continue
    }

    stats.total++
    const fields = line.split('\t')
    if (!(fields[idx.countries_tags] ?? '').includes('en:turkey')) continue
    stats.turkey++

    const get = (name) => (fields[idx[name]] ?? '').trim()
    const num = (name) => parseFloat(get(name)) || 0
    const name = get('product_name')
    if (!name) { stats.rejected++; continue }

    const candidate = {
      code: get('code'),
      name,
      brand: get('brands'),
      kcal: parseFloat(get('energy-kcal_100g')),
      p: num('proteins_100g'),
      c: num('carbohydrates_100g'),
      f: num('fat_100g'),
      fi: num('fiber_100g'),
      grams: servingGrams(get('serving_size')),
    }

    if (!candidate.code || !passesQualityGate(candidate)) { stats.rejected++; continue }
    rows.push(candidate)
  }

  return { rows, stats }
}

function toRow(entry) {
  // Marka ada eklenir: "Yoğurt" tek başına ayırt edici değil, "Yoğurt — Sütaş" öyle.
  const description = entry.brand ? `${entry.name} — ${entry.brand}` : entry.name
  return {
    fdc_id: `off:${entry.code}`,
    barcode: entry.code,
    description,
    search_text: searchText(description),
    dataset: 'off',
    kcal: entry.kcal,
    protein: entry.p,
    carbs: entry.c,
    fat: entry.f,
    fiber: entry.fi,
    measure_grams: entry.grams ? [entry.grams] : [],
  }
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

class PermanentError extends Error {}

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
      if (response.status < 500) throw new PermanentError(detail)
      if (attempt >= MAX_ATTEMPTS) throw new Error(detail)
    } catch (error) {
      if (error instanceof PermanentError || attempt >= MAX_ATTEMPTS) throw error
    }
    await sleep(attempt * 1000)
  }
}

const { rows, stats } = await fetchAndFilter()
console.log(`${stats.total} satır tarandı · ${stats.turkey} Türkiye etiketli · ${stats.rejected} elendi · ${rows.length} yüklenecek`)

if (DRY_RUN) {
  console.log('--dry-run: yükleme yapılmadı. Örnekler:')
  for (const entry of rows.slice(0, 5)) console.log(`  ${toRow(entry).description} · ${Math.round(entry.kcal)} kcal`)
  process.exit(0)
}

const payload = rows.map(toRow)
for (let i = 0; i < payload.length; i += BATCH_SIZE) {
  await upsertBatch(payload.slice(i, i + BATCH_SIZE))
  console.log(`  ${Math.min(i + BATCH_SIZE, payload.length)}/${payload.length}`)
  await sleep(BATCH_PAUSE_MS)
}

console.log(`Bitti: ${payload.length} Türkiye ürünü food_corpus'a yüklendi (dataset=off).`)
console.log('Veri kaynağı: Open Food Facts, ODbL — uygulamada atıf zorunlu.')
