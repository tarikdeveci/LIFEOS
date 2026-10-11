import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// usage.ts modül yüklenirken Deno.env okur. Boş ortam: bütçeler varsayılan
// (pay 0,5; taban 1 USD; deneme 0,5 USD; sert sınır 3 kat).
Object.assign(globalThis, { Deno: { env: { get: () => undefined } } })
const { resolveAiAccess } = await import('../../supabase/functions/_shared/ai/usage.ts')
const { FREE_KINDS } = await import('../../supabase/functions/_shared/ai/freeKinds.ts')

type Client = Parameters<typeof resolveAiAccess>[0]

/** ai-suggest'in tüm rotaları ve parse-meal: kapının gördüğü her `kind`. */
const PRO_ONLY_KINDS = [
  'daily_plan', 'brain_dump', 'task_priority', 'workout_plan', 'workout_program_chat',
  'nutrition_chat', 'daily_report', 'parse_meal',
]

const FUTURE = new Date(Date.now() + 7 * 86_400_000).toISOString()
const PAST = new Date(Date.now() - 86_400_000).toISOString()

function client(options: {
  subscription?: Record<string, unknown> | null
  freeLeft?: number
  monthCost?: number | string
  allowanceError?: boolean
  /** PostgREST tablo dönüşü dizi; tekil nesne de okunabilmeli. */
  asObject?: boolean
}): Client {
  const row = { free_plans_left: options.freeLeft ?? 3, month_cost_usd: options.monthCost ?? 0 }
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: options.subscription ?? null, error: null }) }),
      }),
      insert: async () => ({ data: null, error: null }),
    }),
    rpc: async () => options.allowanceError
      ? { data: null, error: { message: 'ai_allowance yok' } }
      : { data: options.asObject ? row : [row], error: null },
  } as unknown as Client
}

const quiet = async <T>(run: () => Promise<T>): Promise<T> => {
  const original = console.error
  console.error = () => {}
  try { return await run() } finally { console.error = original }
}

const pro = (extra: Record<string, unknown> = {}) => ({ status: 'pro_monthly', current_period_end: FUTURE, ...extra })

// ---------- ücretsiz katman ----------

test('ücretsiz: FREE_KINDS rotası hak varken açılır', async () => {
  for (const kind of FREE_KINDS) {
    for (const left of [3, 1]) {
      const access = await resolveAiAccess(client({ freeLeft: left }), 'u1', kind)
      assert.deepEqual(access, { allowed: true, tier: 'free', overBudget: false }, `${kind}, ${left} hak`)
    }
  }
})

test('ücretsiz: hak bitince her rota 402 pro_required', async () => {
  for (const kind of [...FREE_KINDS, ...PRO_ONLY_KINDS]) {
    const access = await resolveAiAccess(client({ freeLeft: 0 }), 'u1', kind)
    assert.equal(access.allowed, false, kind)
    if (!access.allowed) {
      assert.equal(access.status, 402)
      assert.equal(access.code, 'pro_required')
      assert.equal(access.tier, 'free')
    }
  }
})

test('ücretsiz: Pro rotaları 3 hak dururken de kapalı', async () => {
  for (const kind of PRO_ONLY_KINDS) {
    const access = await resolveAiAccess(client({ freeLeft: 3 }), 'u1', kind)
    assert.equal(access.allowed, false, kind)
    if (!access.allowed) assert.equal(access.status, 402)
  }
})

test('ücretsiz: bilinmeyen ya da boş tip kapalı', async () => {
  for (const kind of ['', 'REPLAN', 'replan_failed', 'life_setup_failed', 'anything']) {
    const access = await resolveAiAccess(client({ freeLeft: 3 }), 'u1', kind)
    assert.equal(access.allowed, false, kind)
  }
})

test('ücretsiz: sayaç okunamazsa kapalı (hak var sanılmaz)', async () => {
  const access = await quiet(() => resolveAiAccess(client({ allowanceError: true }), 'u1', 'replan'))
  assert.equal(access.allowed, false)
})

test('ücretsiz: bozuk sayaç değeri hak sayılmaz', async () => {
  const access = await resolveAiAccess(client({ freeLeft: Number.NaN }), 'u1', 'replan')
  assert.equal(access.allowed, false)
})

test('ücretsiz: sayaç tekil nesne olarak gelse de okunur', async () => {
  const access = await resolveAiAccess(client({ freeLeft: 2, asObject: true }), 'u1', 'replan')
  assert.equal(access.allowed, true)
})

// ---------- Pro sayılmayan abonelikler ----------

test('süresi geçmiş, tarihsiz ya da Pro olmayan abonelik ücretsiz sayılır', async () => {
  const rows: Record<string, unknown>[] = [
    pro({ current_period_end: PAST }),
    pro({ current_period_end: null }),
    pro({ current_period_end: 'tarih değil' }),
    { status: 'free', current_period_end: FUTURE },
    { status: 'cancelled', current_period_end: FUTURE },
    { status: 'expired', current_period_end: FUTURE },
  ]
  for (const row of rows) {
    const access = await resolveAiAccess(client({ subscription: row, freeLeft: 3 }), 'u1', 'nutrition_chat')
    assert.equal(access.allowed, false, JSON.stringify(row))
    assert.equal(access.tier, 'free', JSON.stringify(row))
  }
})

// ---------- deneme ----------

test('deneme: bütçe 0,5 USD; aşınca ucuz model, 3 katında 429', async () => {
  const trial = pro({ period_type: 'trial', price_usd: 20 })
  const at = (cost: number) => resolveAiAccess(client({ subscription: trial, monthCost: cost, freeLeft: 0 }), 'u1', 'nutrition_chat')

  assert.deepEqual(await at(0.49), { allowed: true, tier: 'trial', overBudget: false })
  assert.deepEqual(await at(0.5), { allowed: true, tier: 'trial', overBudget: true })
  assert.deepEqual(await at(1.49), { allowed: true, tier: 'trial', overBudget: true })
  const capped = await at(1.5)
  assert.equal(capped.allowed, false)
  if (!capped.allowed) {
    assert.equal(capped.status, 429)
    assert.equal(capped.code, 'ai_budget_exhausted')
    assert.equal(capped.tier, 'trial')
  }
})

// ---------- Pro ----------

test('Pro: aylık fiyatın yarısı bütçe, 3 katında 429', async () => {
  const sub = pro({ price_usd: 10 })
  const at = (cost: number) => resolveAiAccess(client({ subscription: sub, monthCost: cost }), 'u1', 'daily_plan')

  assert.deepEqual(await at(4.99), { allowed: true, tier: 'pro', overBudget: false })
  assert.deepEqual(await at(5), { allowed: true, tier: 'pro', overBudget: true })
  assert.equal((await at(14.99)).allowed, true)
  const capped = await at(15)
  assert.equal(capped.allowed, false)
  if (!capped.allowed) assert.equal(capped.status, 429)
})

test('Pro yıllık: fiyat 12 aya bölünür', async () => {
  const sub = pro({ status: 'pro_annual', price_usd: 120 })
  const at = (cost: number) => resolveAiAccess(client({ subscription: sub, monthCost: cost }), 'u1', 'daily_plan')
  // 120 / 12 = 10, yarısı 5 USD.
  assert.deepEqual(await at(4.99), { allowed: true, tier: 'pro', overBudget: false })
  assert.deepEqual(await at(5), { allowed: true, tier: 'pro', overBudget: true })
  assert.equal((await at(15)).allowed, false)
})

test('Pro: fiyat bilinmiyor ya da bozuksa taban bütçe 1 USD', async () => {
  for (const price of [undefined, null, 0, -5, 'abc']) {
    const sub = pro({ price_usd: price })
    const under = await resolveAiAccess(client({ subscription: sub, monthCost: 0.99 }), 'u1', 'daily_plan')
    const over = await resolveAiAccess(client({ subscription: sub, monthCost: 1 }), 'u1', 'daily_plan')
    const capped = await resolveAiAccess(client({ subscription: sub, monthCost: 3 }), 'u1', 'daily_plan')
    assert.deepEqual(under, { allowed: true, tier: 'pro', overBudget: false }, String(price))
    assert.deepEqual(over, { allowed: true, tier: 'pro', overBudget: true }, String(price))
    assert.equal(capped.allowed, false, String(price))
  }
})

test('Pro: ucuz plan taban bütçenin altına inmez', async () => {
  // 1 USD'lik plan: yarısı 0,5 ama taban 1.
  const access = await resolveAiAccess(client({ subscription: pro({ price_usd: 1 }), monthCost: 0.9 }), 'u1', 'daily_plan')
  assert.deepEqual(access, { allowed: true, tier: 'pro', overBudget: false })
})

test('Pro: ücretsiz hak sayısı Pro kararını etkilemez, tüm rotalar açık', async () => {
  for (const kind of [...FREE_KINDS, ...PRO_ONLY_KINDS]) {
    const access = await resolveAiAccess(client({ subscription: pro(), freeLeft: 0 }), 'u1', kind)
    assert.deepEqual(access, { allowed: true, tier: 'pro', overBudget: false }, kind)
  }
})

test('Pro: sayaç okunamazsa açık kalır (maliyet 0 sayılır)', async () => {
  const access = await quiet(() => resolveAiAccess(client({ subscription: pro(), allowanceError: true }), 'u1', 'daily_plan'))
  assert.deepEqual(access, { allowed: true, tier: 'pro', overBudget: false })
})

test('Pro: maliyet PostgREST\'ten metin olarak gelse de sayılır', async () => {
  const access = await resolveAiAccess(client({ subscription: pro({ price_usd: 10 }), monthCost: '15.2' }), 'u1', 'daily_plan')
  assert.equal(access.allowed, false)
})

// ---------- sunucu ve SQL aynı kümeyi sayıyor mu ----------

/** Fonksiyonun en son tanımlandığı migration'daki gövde. */
function latestDefinition(fn: string): string {
  const dir = join(import.meta.dirname, '../../supabase/migrations')
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  const pattern = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\([\\s\\S]*?\\$\\$;`, 'g')
  let body = ''
  for (const file of files) {
    for (const match of readFileSync(join(dir, file), 'utf8').matchAll(pattern)) body = match[0]
  }
  assert.notEqual(body, '', `${fn} tanımı bulunamadı`)
  return body
}

function kindLists(sql: string): string[][] {
  return [...sql.matchAll(/IN \(([^)]*)\)/g)]
    .map((m) => [...m[1]!.matchAll(/'([^']+)'/g)].map((k) => k[1]!).sort())
}

test('SQL sayaç ve rezervasyon FREE_KINDS ile aynı kümeyi kullanır', () => {
  const expected = [...FREE_KINDS].sort()
  for (const fn of ['ai_allowance', 'reserve_ai_use']) {
    const lists = kindLists(latestDefinition(fn))
    assert.ok(lists.length > 0, `${fn} içinde kind listesi yok`)
    for (const list of lists) assert.deepEqual(list, expected, fn)
  }
})

test('SQL: ücretsiz hak sayısı 3, sayaç ve rezervasyon aynı sınırı kullanır', () => {
  assert.match(latestDefinition('ai_allowance'), /GREATEST\(0, 3 - count\(\*\)/)
  assert.match(latestDefinition('reserve_ai_use'), /IF v_used >= 3 THEN/)
})
