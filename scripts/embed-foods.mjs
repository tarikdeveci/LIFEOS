#!/usr/bin/env node
// Yiyecek tablolarını semantik arama için gömer (backfill).
//
//   node scripts/embed-foods.mjs                # eksik olanları gömer
//   node scripts/embed-foods.mjs --table items  # yalnızca food_items
//   node scripts/embed-foods.mjs --all          # bayat olmayanları da yeniden gömer
//   node scripts/embed-foods.mjs --dry          # ne yapacağını söyler, yazmaz
//
// Yalnızca EKSİK satırları gömer: embedding NULL ya da embedding_text artık
// satırın güncel metnini karşılamıyor. Bu yüzden tekrar tekrar çalıştırmak
// güvenli ve ucuz — yeni yiyecek eklendiğinde bir daha çalıştırılır.
//
// Maliyet: text-embedding-3-small, 1M token başına 0.02 USD. 14.5k korpus
// satırı + ~350 küratörlü satır toplam ~250k token, yani bir kereliğine
// yaklaşık 0.005 USD. Sorgu tarafı öğün kalemi başına ~10 token.

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const EMBEDDING_MODEL = 'text-embedding-3-small'
// Migration 042'deki vector(512) ile AYNI olmak zorunda. Biri değişirse
// pgvector yazmayı reddeder ve arama sessizce boş dönmez, yüksek sesle patlar.
const DIMENSIONS = 512
// OpenAI tek istekte 2048 girdi kabul ediyor; 256 hem hafıza hem de yarıda
// kalan bir çalıştırmada kaybedilen iş açısından daha makul bir parti.
const BATCH = 256
// Yazma partisi ayri ve daha kucuk tutuluyor. 256'lik tek UPDATE, HNSW indeksi
// buyudukce Postgres'in deyim zaman asimini asiyor (57014; ~13k satirda olculdu):
// her satir icin vektor indeksine ekleme yapiliyor ve maliyet indeks boyutuyla
// birlikte artiyor. Gomme cagrisini kucultmek gereksiz (OpenAI 2048 kabul
// ediyor); zaman asimina giren yalnizca veritabani yazmasi.
const WRITE_CHUNK = 64

function loadEnv() {
  const env = { ...process.env }
  for (const file of ['.env', '.env.local']) {
    try {
      for (const line of readFileSync(resolve(root, file), 'utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
        if (match && !env[match[1]]) env[match[1]] = match[2].replace(/^["']|["']$/g, '')
      }
    } catch { /* dosya yoksa ortam değişkenleri yeterli */ }
  }
  return env
}

const env = loadEnv()
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const OPENAI_KEY = env.OPENAI_API_KEY

const argv = process.argv.slice(2)
const only = argv.includes('--table') ? argv[argv.indexOf('--table') + 1] : null
const reembedAll = argv.includes('--all')
const dryRun = argv.includes('--dry')

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli (.env).')
  process.exit(1)
}
if (!OPENAI_KEY && !dryRun) {
  console.error('OPENAI_API_KEY gerekli. .env dosyasına ekle:\n  OPENAI_API_KEY=sk-...')
  process.exit(1)
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

async function rest(path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers })
  if (!response.ok) throw new Error(`${path} → ${response.status} ${await response.text()}`)
  return response.json()
}

async function rpc(name, body) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${name} → ${response.status} ${await response.text()}`)
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

/**
 * Küratörlü satırın gömülecek metni: Türkçe ad + İngilizce ad + alias'lar.
 *
 * İki dilin birlikte olması kasıtlı. Kullanıcı Türkçe arıyor ama korpusun
 * tamamı İngilizce; iki dilli çapa, "hellim" sorgusunun hem "Hellim" satırına
 * hem "Halloumi cheese" korpus satırına yakın düşmesini sağlıyor.
 */
function foodItemText(row) {
  const parts = [row.name]
  if (row.name_en) parts.push(row.name_en)
  if (Array.isArray(row.aliases) && row.aliases.length > 0) parts.push(row.aliases.join(', '))
  return parts.join(' | ')
}

function corpusText(row) {
  return row.description
}

async function embedBatch(texts) {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts, dimensions: DIMENSIONS }),
  })
  if (!response.ok) throw new Error(`embeddings → ${response.status} ${await response.text()}`)
  const payload = await response.json()
  const vectors = (payload.data ?? [])
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.embedding)

  if (vectors.length !== texts.length) {
    throw new Error(`embedding sayısı uyuşmuyor: ${vectors.length} ≠ ${texts.length}`)
  }
  for (const vector of vectors) {
    if (vector.length !== DIMENSIONS) {
      throw new Error(`boyut ${vector.length}, beklenen ${DIMENSIONS} — migration 042 ile uyumsuz`)
    }
  }
  return vectors
}

/** Sayfalayarak tüm satırları çeker: PostgREST tek istekte 1000 satırla sınırlı. */
async function fetchAll(table, columns) {
  const rows = []
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    const page = await rest(`${table}?select=${columns}&limit=${pageSize}&offset=${offset}`)
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
}

async function run(label, table, columns, idKey, textOf, writeRpc) {
  console.log(`\n── ${label} ──`)
  const rows = await fetchAll(table, columns)

  // Bayatlık ölçütü: gömme yok ya da gömmeyi üreten metin artık güncel değil.
  const pending = rows.filter((row) => {
    const text = textOf(row)
    if (!text || !text.trim()) return false
    if (reembedAll) return true
    return !row.embedding_text || row.embedding_text !== text
  })

  console.log(`  ${rows.length} satır, ${pending.length} tanesi gömülecek`)
  if (pending.length === 0) return 0
  if (dryRun) {
    for (const row of pending.slice(0, 5)) console.log(`    örnek: ${textOf(row)}`)
    return 0
  }

  let written = 0
  for (let i = 0; i < pending.length; i += BATCH) {
    const slice = pending.slice(i, i + BATCH)
    const texts = slice.map(textOf)
    const vectors = await embedBatch(texts)

    const payload = slice.map((row, index) => ({
      id: String(row[idKey]),
      text: texts[index],
      embedding: vectors[index],
    }))

    for (let j = 0; j < payload.length; j += WRITE_CHUNK) {
      const chunk = payload.slice(j, j + WRITE_CHUNK)
      const updated = await rpc(writeRpc, { p_rows: chunk })
      written += typeof updated === 'number' ? updated : chunk.length
    }
    process.stdout.write(`\r  yazıldı: ${written}/${pending.length}`)
  }
  process.stdout.write('\n')
  return written
}

const tasks = []
if (!only || only === 'items') {
  tasks.push(() => run(
    'food_items',
    'food_items',
    'id,name,name_en,aliases,embedding_text',
    'id',
    foodItemText,
    'set_food_item_embeddings',
  ))
}
if (!only || only === 'corpus') {
  tasks.push(() => run(
    'food_corpus',
    'food_corpus',
    'fdc_id,description,embedding_text',
    'fdc_id',
    corpusText,
    'set_food_corpus_embeddings',
  ))
}

let total = 0
for (const task of tasks) total += await task()

console.log(`\nToplam ${total} satır gömüldü.`)
if (dryRun) console.log('(--dry: hiçbir şey yazılmadı)')
