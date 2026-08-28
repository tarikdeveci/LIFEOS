// Beslenme çözümleme hattının doğruluk ölçümü.
//
//   pnpm eval:nutrition                      # canlı Supabase (global food_items)
//   pnpm eval:nutrition -- --foods x.json    # çevrimdışı sözlük fixture'ı
//   pnpm eval:nutrition -- --case X02        # tek vaka, ayrıntılı
//
// Harness'in tek işi şu soruyu ölçülebilir kılmak: "doğruluk değişti mi, ve neden?"
// Beklenen kalori ETİKETTE YAZMAZ — her vakada (yiyecek, gramaj) etiketinden ve
// veritabanı satırından hesaplanır. Böylece bir etiket "hangi yiyecek" veya "ne
// kadar" konusunda yanılabilir (ikisi de gözden geçirilebilir iddialardır) ama
// bunların ima ettiği kalori konusunda yanılamaz.
//
// Ölçülen hat DETERMİNİSTİK hattır: kural çıkarıcı, doğrulayıcı yok, gram tahmini
// yok. Model katmanı bilerek dışarıda — amaç, modelsiz tabanın nereye kadar
// gittiğini ve bir regresyonun modelden mi kuraldan mı geldiğini ayırabilmek.

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createRulesExtractor, parseMeal } from '../../supabase/functions/_shared/nutrition/index.ts'
import { normalizePhrase } from '../../supabase/functions/_shared/nutrition/normalize.ts'
import { per100gFromCurated } from '../../supabase/functions/_shared/nutrition/refs.ts'
import type {
  CorpusFood,
  CuratedFood,
  FoodRepo,
  ParseMealResult,
} from '../../supabase/functions/_shared/nutrition/types.ts'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')

interface ExpectedFood {
  food: string
  grams?: number
  servings?: number
}

interface Case {
  id: string
  stratum: 'easy' | 'ambiguous' | 'adversarial'
  input: string
  probes: string
  expect: ExpectedFood[]
  expect_questions?: number
}

interface Args {
  foods?: string
  corpus: string
  case?: string
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const args: Args = { corpus: resolve(root, 'supabase/data/food-corpus.json') }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (flag === '--foods' && value) { args.foods = resolve(process.cwd(), value); i++ }
    else if (flag === '--corpus' && value) { args.corpus = resolve(process.cwd(), value); i++ }
    else if (flag === '--case' && value) { args.case = value.toUpperCase(); i++ }
  }
  return args
}

function loadEnvFile(name: string): Record<string, string> {
  try {
    const out: Record<string, string> = {}
    for (const line of readFileSync(resolve(root, name), 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (match?.[1] && match[2] !== undefined) out[match[1]] = match[2].replace(/^["']|["']$/g, '')
    }
    return out
  } catch {
    return {}
  }
}

// ============================
// Veri kaynakları
// ============================

interface CorpusEntry {
  n: string
  k: number
  p: number
  c: number
  f: number
  fi: number
  g?: number[]
  d: string
}

function offlineCorpusSearch(
  corpus: Record<string, CorpusEntry>,
  query: string,
  limit: number,
): CorpusFood[] {
  // SQL tarafındaki word_similarity'nin kaba karşılığı. Sıralama birebir aynı
  // olmayabilir; bu farkı bilerek kabul ediyoruz — korpus rungunun güvenliği
  // skordan değil doğrulayıcıdan geliyor, eval'de de doğrulayıcı yok.
  const q = normalizePhrase(query)
  if (q.length < 3) return []
  const words = q.split(' ').filter((w) => w.length > 2)
  const scored: CorpusFood[] = []

  for (const [id, entry] of Object.entries(corpus)) {
    const text = entry.n.toLowerCase()
    let score = 0
    if (text.includes(q)) score = 0.9
    else if (words.length > 0) {
      const hits = words.filter((w) => text.includes(w)).length
      score = hits / words.length
    }
    if (score < 0.5) continue
    scored.push({
      fdc_id: id,
      description: entry.n,
      search_text: text,
      dataset: entry.d,
      kcal: entry.k,
      protein: entry.p,
      carbs: entry.c,
      fat: entry.f,
      fiber: entry.fi,
      measure_grams: entry.g ?? [],
      score,
    })
  }

  return scored.sort((a, b) => b.score - a.score || a.description.length - b.description.length)
    .slice(0, limit)
}

function emptyRepoParts() {
  return {
    corpusByIds: () => Promise.resolve([] as CorpusFood[]),
    userAliases: () => Promise.resolve(new Map()),
    portionMemory: () => Promise.resolve(new Map()),
    recordGaps: () => Promise.resolve(),
  }
}

function fileRepo(foodsPath: string, corpusPath: string): FoodRepo {
  const foods = JSON.parse(readFileSync(foodsPath, 'utf8')) as CuratedFood[]
  let corpus: Record<string, CorpusEntry> = {}
  try {
    corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as Record<string, CorpusEntry>
  } catch {
    console.warn('  (korpus dosyası okunamadı — korpus basamağı kapalı)')
  }

  return {
    curated: () => Promise.resolve(foods),
    searchCorpus: (query, limit) => Promise.resolve(offlineCorpusSearch(corpus, query, limit)),
    ...emptyRepoParts(),
  }
}

function dbRepo(url: string, key: string): FoodRepo {
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  let cache: Promise<CuratedFood[]> | null = null

  return {
    curated: () => {
      if (!cache) {
        const columns =
          'id,name,name_en,aliases,serving_size,serving_unit,calories,protein,carbs,fat,fiber,category,is_countable'
        cache = fetch(`${url}/rest/v1/food_items?select=${columns}&user_id=is.null`, { headers })
          .then((r) => r.json() as Promise<CuratedFood[]>)
      }
      return cache
    },
    searchCorpus: async (query, limit) => {
      const response = await fetch(`${url}/rest/v1/rpc/search_food_corpus`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ q: query, lim: limit }),
      })
      if (!response.ok) return []
      return await response.json() as CorpusFood[]
    },
    ...emptyRepoParts(),
  }
}

// ============================
// Ölçüm
// ============================

interface CaseResult {
  case: Case
  result: ParseMealResult
  expectedKcal: number | null
  labelMissing: string[]
  matched: number
  expectedCount: number
  extra: number
  ape: number | null
  covered: boolean
  autoLogged: boolean
  errors: string[]
  ms: number
}

const ERROR_LABELS: Record<string, string> = {
  E1: 'yanlış yiyecek',
  E2: 'eksik yiyecek',
  E3: 'fazladan yiyecek',
  E4: 'gramaj sapması',
  E5: 'beklenmeyen soru',
  E6: 'eksik soru',
  E7: 'etiket veritabanında yok',
}

function evaluate(testCase: Case, result: ParseMealResult, byName: Map<string, CuratedFood>, ms: number): CaseResult {
  const errors: string[] = []
  const labelMissing: string[] = []
  let expectedKcal = 0
  let hasKcal = true

  for (const expected of testCase.expect) {
    const food = byName.get(expected.food)
    if (!food) {
      labelMissing.push(expected.food)
      hasKcal = false
      continue
    }
    const grams = expected.grams ?? (expected.servings ?? 1) * (food.serving_size || 100)
    expectedKcal += (per100gFromCurated(food).kcal * grams) / 100
  }
  if (labelMissing.length > 0) errors.push('E7')

  const actualNames = result.items.map((item) => item.name)
  let matched = 0
  for (const expected of testCase.expect) {
    const item = result.items.find((i) => i.name === expected.food)
    if (!item) { errors.push('E2'); continue }
    matched++

    const food = byName.get(expected.food)
    if (food) {
      const grams = expected.grams ?? (expected.servings ?? 1) * (food.serving_size || 100)
      const drift = Math.abs(item.grams - grams) / Math.max(grams, 1)
      if (drift > 0.1) errors.push('E4')
    }
  }

  const expectedNames = new Set(testCase.expect.map((e) => e.food))
  const extra = actualNames.filter((name) => !expectedNames.has(name)).length
  if (extra > 0) errors.push(testCase.expect.length > 0 ? 'E3' : 'E1')

  const expectedQuestions = testCase.expect_questions
  if (expectedQuestions !== undefined) {
    if (result.questions.length > expectedQuestions) errors.push('E5')
    if (result.questions.length < expectedQuestions) errors.push('E6')
  }

  const totalKcal = result.total_calories
  const ape = hasKcal && expectedKcal > 0
    ? Math.abs(totalKcal - expectedKcal) / expectedKcal
    : null
  const covered = hasKcal && expectedKcal > 0
    ? expectedKcal >= result.total_calories_min && expectedKcal <= result.total_calories_max
    : true

  return {
    case: testCase,
    result,
    expectedKcal: hasKcal ? expectedKcal : null,
    labelMissing,
    matched,
    expectedCount: testCase.expect.length,
    extra,
    ape,
    covered,
    autoLogged: result.items.length > 0 &&
      result.questions.length === 0 &&
      result.items.every((item) => item.disposition === 'auto'),
    errors: [...new Set(errors)],
    ms,
  }
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? ((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!
}

async function main() {
  const args = parseArgs()
  const suite = JSON.parse(readFileSync(resolve(here, 'cases.json'), 'utf8')) as {
    version: string
    cases: Case[]
  }

  let repo: FoodRepo
  let source: string
  if (args.foods) {
    repo = fileRepo(args.foods, args.corpus)
    source = `dosya: ${args.foods}`
  } else {
    const env = { ...loadEnvFile('.env.production'), ...loadEnvFile('.env'), ...process.env }
    const url = env['SUPABASE_URL'] ?? env['NEXT_PUBLIC_SUPABASE_URL']
    const key = env['SUPABASE_SERVICE_ROLE_KEY'] ?? env['SUPABASE_ANON_KEY']
    if (!url || !key) {
      console.error('Canlı mod için SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY gerekli, ya da --foods <dosya> ver.')
      process.exit(1)
    }
    repo = dbRepo(url, key)
    source = `Supabase: ${url}`
  }

  const curated = await repo.curated()
  const byName = new Map(curated.map((food) => [food.name, food]))
  const extractor = createRulesExtractor()

  const cases = args.case ? suite.cases.filter((c) => c.id === args.case) : suite.cases
  if (cases.length === 0) {
    console.error(`Vaka bulunamadı: ${args.case}`)
    process.exit(1)
  }

  const results: CaseResult[] = []
  for (const testCase of cases) {
    const started = performance.now()
    const result = await parseMeal(testCase.input, {
      repo,
      extractor,
      verifier: null,
      portionEstimator: null,
    })
    results.push(evaluate(testCase, result, byName, performance.now() - started))
  }

  const passed = results.filter((r) => r.errors.length === 0)
  const apes = results.map((r) => r.ape).filter((v): v is number => v !== null)
  const latencies = results.map((r) => r.ms)
  const expectedTotal = results.reduce((sum, r) => sum + r.expectedCount, 0)
  const matchedTotal = results.reduce((sum, r) => sum + r.matched, 0)
  const scorable = results.filter((r) => r.expectedKcal !== null && r.expectedKcal > 0)

  console.log(`\nLifeOS beslenme değerlendirmesi — ${results.length} vaka (${suite.version})`)
  console.log(`Kaynak: ${source}`)
  console.log(`Çıkarıcı: ${extractor.name} · doğrulayıcı: yok · gram tahmini: yok\n`)

  const rows: [string, string][] = [
    ['vaka geçme oranı', percent(passed.length / results.length)],
    ['yiyecek eşleşme doğruluğu', expectedTotal > 0 ? percent(matchedTotal / expectedTotal) : '—'],
    ['kcal medyan APE', apes.length > 0 ? percent(median(apes)) : '—'],
    ['kcal ±%10 içinde', apes.length > 0 ? percent(apes.filter((a) => a <= 0.1).length / apes.length) : '—'],
    ['aralık kapsaması', scorable.length > 0 ? percent(scorable.filter((r) => r.covered).length / scorable.length) : '—'],
    ['otomatik loglanan', percent(results.filter((r) => r.autoLogged).length / results.length)],
    ['soru üreten vaka', percent(results.filter((r) => r.result.questions.length > 0).length / results.length)],
    ['gecikme p50 / p95', `${quantile(latencies, 0.5).toFixed(1)} ms / ${quantile(latencies, 0.95).toFixed(1)} ms`],
  ]
  for (const [label, value] of rows) console.log(`  ${label.padEnd(28)} ${value}`)

  const taxonomy = new Map<string, number>()
  for (const result of results) {
    for (const code of result.errors) taxonomy.set(code, (taxonomy.get(code) ?? 0) + 1)
  }

  if (taxonomy.size > 0) {
    console.log('\nHata dökümü:')
    for (const [code, count] of [...taxonomy.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${code} ${(ERROR_LABELS[code] ?? '').padEnd(24)} ${count}`)
    }
  }

  const failed = results.filter((r) => r.errors.length > 0)
  if (failed.length > 0) {
    console.log('\nBaşarısız vakalar:')
    for (const result of failed) {
      const got = result.result.items.length > 0
        ? result.result.items.map((i) => `${i.name} ${i.grams}g/${i.calories}kcal [${i.resolve_rung}·${i.portion_rung}]`).join(' + ')
        : `${result.result.questions.length} soru`
      console.log(`  ${result.case.id} "${result.case.input}"`)
      console.log(`     beklenen: ${result.case.expect.map((e) => `${e.food} ${e.grams ?? `${e.servings ?? 1}×porsiyon`}`).join(' + ') || `${result.case.expect_questions ?? 0} soru`}`)
      console.log(`     gelen   : ${got}`)
      console.log(`     kod     : ${result.errors.join(', ')} — ${result.case.probes}`)
      if (result.labelMissing.length > 0) {
        console.log(`     NOT: bu isimler veritabanında yok → ${result.labelMissing.join(', ')}`)
      }
    }
  }

  if (args.case) {
    console.log('\nİz:')
    console.log(JSON.stringify(results[0]?.result.trace, null, 2))
  }

  console.log(
    '\nUYARI: Bu sayılar 34 vakalık küçük ve doygun bir set üzerinde. Yüksek bir oran\n' +
    '"sistem doğru" demek değil, "bu set bu hattı ayırt edemiyor" demek olabilir.\n' +
    'Bir hata bulduğunda önce buraya bir vaka ekle, sonra düzelt.\n',
  )

  process.exit(failed.length > 0 ? 1 : 0)
}

main().catch((error: unknown) => {
  console.error('Değerlendirme hatası:', error)
  process.exit(1)
})
