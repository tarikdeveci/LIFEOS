import { test } from 'node:test'
import assert from 'node:assert/strict'

// usage.ts modül yüklenirken Deno.env okur.
Object.assign(globalThis, { Deno: { env: { get: () => undefined } } })
const { AiLedger, failedKind } = await import('../../supabase/functions/_shared/ai/usage.ts')
const { FREE_KINDS } = await import('../../supabase/functions/_shared/ai/freeKinds.ts')

type Ledger = InstanceType<typeof AiLedger>
type Client = ConstructorParameters<typeof AiLedger>[0]

interface RpcCall { name: string; args: Record<string, unknown> | undefined }
interface Insert { values: Record<string, unknown> }

type Result = Parameters<Ledger['add']>[0]

const MESSAGE: Result = {
  text: '',
  toolInput: null,
  usage: { input: 1000, output: 500, cacheRead: 0, cacheWrite: 0 },
  stopReason: 'end',
  route: 'replan',
  modelId: 'opus-5',
  apiModel: 'claude-opus-5',
  costUsd: 0.0175,
  mode: 'primary',
}

async function record(ledger: Ledger, result: Result): Promise<void> {
  ledger.add(result)
  await ledger.flush()
}

/** Kullanıcı istemcisi: rpc ve events insert'ünü kaydeder. `reserve` rezervasyon cevabıdır. */
function userClient(reserve: { data: unknown; error?: { message: string } | null }) {
  const rpcs: RpcCall[] = []
  const inserts: Insert[] = []
  const client = {
    from: () => ({
      insert: async (values: Record<string, unknown>) => { inserts.push({ values }); return { data: null, error: null } },
    }),
    rpc: async (name: string, args?: Record<string, unknown>) => {
      rpcs.push({ name, args })
      return { data: reserve.data, error: reserve.error ?? null }
    },
  } as unknown as Client
  return { client, rpcs, inserts }
}

function serviceClient(fail = 0) {
  const calls: RpcCall[] = []
  let failures = fail
  const client = {
    rpc: async (name: string, args?: Record<string, unknown>) => {
      calls.push({ name, args })
      if (failures > 0) { failures -= 1; return { data: null, error: { message: 'geçici' } } }
      return { data: true, error: null }
    },
  } as unknown as Client
  return { client, calls }
}

const quiet = async <T>(run: () => Promise<T>): Promise<T> => {
  const original = console.error
  console.error = () => {}
  try { return await run() } finally { console.error = original }
}

const props = (call: RpcCall | undefined) => call?.args?.['p_props'] as Record<string, unknown>

test('ücretsiz: model çağrısından önce rezervasyon, yanıttan sonra aynı satıra maliyet', async () => {
  const user = userClient({ data: 41 })
  const service = serviceClient()
  const ledger: Ledger = new AiLedger(user.client, 'u1', 'life_setup', 'free', service.client)

  assert.equal(await ledger.begin(), true)
  assert.deepEqual(user.rpcs, [{ name: 'reserve_ai_use', args: { p_kind: 'life_setup' } }])
  assert.equal(service.calls.length, 0, 'çağrı gelmeden satır kapanmaz')

  await record(ledger, MESSAGE)
  assert.equal(user.inserts.length, 0, 'ayrıca yeni satır yazılmaz')
  assert.equal(service.calls.length, 1)
  assert.equal(service.calls[0]?.name, 'settle_ai_use')
  assert.equal(service.calls[0]?.args?.['p_id'], 41)
  assert.equal(service.calls[0]?.args?.['p_user_id'], 'u1')
  assert.equal(props(service.calls[0])['kind'], 'life_setup')
  assert.equal(props(service.calls[0])['cost_usd'], 0.0175)
})

test('ücretsiz: hak yoksa (rezervasyon null) ya da rpc hata verirse begin false', async () => {
  const exhausted = new AiLedger(userClient({ data: null }).client, 'u1', 'replan', 'free', serviceClient().client)
  assert.equal(await exhausted.begin(), false)

  const broken = new AiLedger(userClient({ data: null, error: { message: 'yok' } }).client, 'u1', 'replan', 'free', serviceClient().client)
  assert.equal(await quiet(() => broken.begin()), false)
})

test('ücretsiz: ayrıştırılamayan yanıt hak yakmaz, kind FREE_KINDS dışına çıkar, maliyet yazılır', async () => {
  const service = serviceClient()
  const ledger = new AiLedger(userClient({ data: 7 }).client, 'u1', 'life_setup', 'free', service.client)
  await ledger.begin()
  ledger.markFailed()
  await record(ledger, MESSAGE)

  const kind = props(service.calls[0])['kind'] as string
  assert.equal(kind, failedKind('life_setup'))
  assert.equal(FREE_KINDS.has(kind), false)
  assert.ok((props(service.calls[0])['cost_usd'] as number) > 0)
})

test('ücretsiz: stopReason max_tokens hak yakmaz', async () => {
  const service = serviceClient()
  const ledger = new AiLedger(userClient({ data: 7 }).client, 'u1', 'replan', 'free', service.client)
  await ledger.begin()
  await record(ledger, { ...MESSAGE, stopReason: 'max_tokens' })
  assert.equal(props(service.calls[0])['kind'], 'replan_failed')
})

test('ücretsiz: model fırlatırsa abandon rezervasyonu hak saymadan kapatır; ikinci çağrı zararsız', async () => {
  const service = serviceClient()
  const ledger = new AiLedger(userClient({ data: 9 }).client, 'u1', 'replan', 'free', service.client)
  await ledger.begin()
  await ledger.abandon()
  await ledger.abandon()
  assert.equal(service.calls.length, 1)
  assert.equal(props(service.calls[0])['kind'], 'replan_failed')
  assert.equal(props(service.calls[0])['cost_usd'], 0)
})

test('ücretsiz: kapatma geçici hatada tekrar denenir', async () => {
  const service = serviceClient(2)
  const ledger = new AiLedger(userClient({ data: 3 }).client, 'u1', 'replan', 'free', service.client)
  await ledger.begin()
  await quiet(() => record(ledger, MESSAGE))
  assert.equal(service.calls.length, 3)
})

test('ücretsiz: begin tekrar çağrılsa ikinci hak ayırmaz', async () => {
  const user = userClient({ data: 5 })
  const ledger = new AiLedger(user.client, 'u1', 'replan', 'free', serviceClient().client)
  await ledger.begin()
  await ledger.begin()
  assert.equal(user.rpcs.length, 1)
})

test('Pro ve deneme: begin hiçbir şey yapmaz, satır çağrıdan sonra insert ile yazılır, max_tokens kind değiştirmez', async () => {
  for (const tier of ['pro', 'trial'] as const) {
    const user = userClient({ data: 1 })
    const ledger = new AiLedger(user.client, 'u1', 'replan', tier)
    assert.equal(await ledger.begin(), true)
    assert.equal(user.rpcs.length, 0)
    await record(ledger, { ...MESSAGE, stopReason: 'max_tokens' })
    assert.equal(user.inserts.length, 1)
    const row = user.inserts[0]?.values
    assert.equal(row?.['name'], 'ai_used')
    assert.equal((row?.['props'] as Record<string, unknown>)['kind'], 'replan')
    assert.equal((row?.['props'] as Record<string, unknown>)['tier'], tier)
  }
})

test('eşzamanlılık: veritabanı atomik ayırır, N paralel istekten yalnızca hak kadarı modele gider', async () => {
  // reserve_ai_use'un kilitli sayımını taklit eder: ilk 3 çağrı id alır, gerisi null.
  let used = 0
  const shared = {
    from: () => ({ insert: async () => ({ data: null, error: null }) }),
    rpc: async () => ({ data: used < 3 ? (used += 1) : null, error: null }),
  } as unknown as Client
  let modelCalls = 0
  const request = async () => {
    const ledger = new AiLedger(shared, 'u1', 'life_setup', 'free', serviceClient().client)
    if (!await ledger.begin()) return 402
    modelCalls += 1
    await record(ledger, MESSAGE)
    return 200
  }
  const statuses = await Promise.all(Array.from({ length: 8 }, request))
  assert.equal(modelCalls, 3)
  assert.equal(statuses.filter((s) => s === 402).length, 5)
})

test('ledger: yeni alanlar', async () => {
  const user = userClient({ data: 1 })
  const ledger = new AiLedger(user.client, 'u1', 'meal', 'pro')
  ledger.add({ ...MESSAGE, route: 'meal_extract', costUsd: 0.0123456 })
  ledger.add({
    ...MESSAGE,
    route: 'meal_verify',
    mode: 'fallback',
    text: 'abc',
    toolInput: { a: 1 },
    apiModel: 'claude-sonnet-5',
    costUsd: 0.0001,
  })
  await ledger.flush()
  const row = user.inserts[0]?.values['props'] as Record<string, unknown>
  assert.equal(row['calls'], 2)
  assert.equal(row['mode'], 'fallback')
  assert.equal(row['text_chars'], 3 + JSON.stringify({ a: 1 }).length)
  assert.equal(row['parse_ok'], true)
  assert.equal(row['route'], 'meal_extract,meal_verify')
  assert.equal(row['model'], 'claude-opus-5,claude-sonnet-5')
  assert.equal(row['cost_usd'], 0.012446)
})

test('ledger: markFailed parse_ok false, max_tokens da', async () => {
  const user = userClient({ data: 1 })
  const a = new AiLedger(user.client, 'u1', 'replan', 'pro')
  a.add(MESSAGE)
  a.markFailed()
  await a.flush()
  const b = new AiLedger(user.client, 'u1', 'replan', 'pro')
  b.add({ ...MESSAGE, stopReason: 'max_tokens' })
  await b.flush()
  assert.equal((user.inserts[0]?.values['props'] as Record<string, unknown>)['parse_ok'], false)
  assert.equal((user.inserts[1]?.values['props'] as Record<string, unknown>)['parse_ok'], false)
})

test('ledger: mode() çağrı yoksa null, flush sonrası da isteğin modunu verir', async () => {
  const user = userClient({ data: 1 })
  const ledger = new AiLedger(user.client, 'u1', 'replan', 'pro')
  assert.equal(ledger.mode(), null)
  ledger.add(MESSAGE)
  assert.equal(ledger.mode(), 'primary')
  ledger.add({ ...MESSAGE, mode: 'fallback' })
  assert.equal(ledger.mode(), 'fallback')
  // Bildirim ve yanıt flush'tan sonra okur: yedek bilgisi kaybolmamalı.
  await ledger.flush()
  assert.equal(ledger.mode(), 'fallback')
  // Sonraki parti kendi modunu yazar, isteğin modu yedek kalır.
  ledger.add(MESSAGE)
  await ledger.flush()
  assert.equal((user.inserts[1]?.values['props'] as Record<string, unknown>)['mode'], 'primary')
  assert.equal(ledger.mode(), 'fallback')
})
