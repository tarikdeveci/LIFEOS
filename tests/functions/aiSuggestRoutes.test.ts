import { test } from 'node:test'
import assert from 'node:assert/strict'

import { FREE_KINDS } from '../../supabase/functions/_shared/ai/freeKinds.ts'
import type { LlmRequest, LlmResult } from '../../supabase/functions/_shared/ai/llm/types.ts'
import { withAiMode, type RouteContext, type SuggestRequest } from '../../supabase/functions/ai-suggest/request.ts'

const { handleLifeSetup } = await import('../../supabase/functions/ai-suggest/lifeSetup.ts')
const { handleDailyReport } = await import('../../supabase/functions/ai-suggest/dailyReport.ts')
const { handleBrainDump, handleTaskPriority } = await import('../../supabase/functions/ai-suggest/tasks.ts')
const { handleDailyPlan } = await import('../../supabase/functions/ai-suggest/planning.ts')
const { handleWorkoutPlan } = await import('../../supabase/functions/ai-suggest/workout.ts')
const { handleNutritionChat } = await import('../../supabase/functions/ai-suggest/nutrition.ts')

// ---------- erişim kararı ----------

test('erişim: life_setup ücretsiz haklara dahil, daily_report yalnızca Pro', () => {
  assert.equal(FREE_KINDS.has('life_setup'), true)
  assert.equal(FREE_KINDS.has('replan'), true)
  assert.equal(FREE_KINDS.has('daily_report'), false)
  for (const kind of ['brain_dump', 'nutrition_chat', 'workout_plan', 'workout_program_chat', 'daily_plan', 'task_priority']) {
    assert.equal(FREE_KINDS.has(kind), false, `${kind} ücretsiz olmamalı`)
  }
})

// ---------- sahte bağlam ----------

type ModelCall = LlmRequest

function harness(options: {
  reply?: string; row?: unknown; profile?: unknown; task?: unknown; readError?: string; writeError?: string
  /** Ücretsiz hak ayrılamadı (begin false). */ denyBegin?: boolean
  stopReason?: LlmResult['stopReason']
} = {}) {
  const modelCalls: ModelCall[] = []
  const ledgerEvents: string[] = []
  const updates: { table: string; values: unknown }[] = []

  // Her sorgu yöntemi zincirlenir; await edilince ya da tekil okumada sonuç döner.
  const chain = (result: unknown): Record<string, unknown> => {
    const link: Record<string, unknown> = new Proxy({}, {
      get: (_target, prop) => {
        if (prop === 'then') return (resolve: (value: unknown) => unknown) => resolve(result)
        if (prop === 'maybeSingle' || prop === 'single') return async () => result
        return () => link
      },
    })
    return link
  }

  const supabase = {
    from: (table: string) => ({
      select: () => chain(
        table === 'daily_reports'
          ? { data: options.row ?? null, error: options.readError ? { message: options.readError } : null }
          : { data: table === 'tasks' ? options.task ?? null : options.profile ?? null, error: null },
      ),
      update: (values: unknown) => {
        updates.push({ table, values })
        return chain({ error: options.writeError ? { message: options.writeError } : null })
      },
    }),
  }

  const generate = async (request: ModelCall): Promise<LlmResult> => {
    modelCalls.push(request)
    ledgerEvents.push('model')
    return {
      text: options.reply ?? '',
      toolInput: null,
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
      stopReason: options.stopReason ?? 'end',
      route: 'life_setup',
      modelId: 'test',
      apiModel: 'test',
      costUsd: 0,
      mode: 'primary',
    }
  }

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

  const route = (body: Partial<SuggestRequest>): RouteContext => ({
    supabase, userId: 'u1', body: { type: 'life_setup', ...body }, generate,
    ledger: {
      begin: async () => { ledgerEvents.push('begin'); return !options.denyBegin },
      markFailed: () => { ledgerEvents.push('failed') },
    },
    lang: 'tr', langInstr: '', today: '2026-10-05', json,
  } as unknown as RouteContext)

  return { route, modelCalls, ledgerEvents, updates }
}

async function read(response: Response): Promise<{ status: number; body: Record<string, unknown> }> {
  return { status: response.status, body: await response.json() as Record<string, unknown> }
}

// ---------- life_setup ----------

test('life_setup: boş ve metin olmayan istek 400, model çağrılmaz', async () => {
  for (const text of [undefined, '', '   \n', 42]) {
    const h = harness()
    const { status, body } = await read(await handleLifeSetup(h.route({ type: 'life_setup', text: text as string })))
    assert.equal(status, 400)
    assert.equal(body['code'], 'text_empty')
    assert.equal(h.modelCalls.length, 0)
  }
})

test('life_setup: 8000 karakteri aşan metin 400 verir, sessizce kesilmez', async () => {
  const h = harness({ reply: '{"summary":"x"}' })
  const { status, body } = await read(await handleLifeSetup(h.route({ text: 'a'.repeat(8001) })))
  assert.equal(status, 400)
  assert.equal(body['code'], 'text_too_long')
  assert.equal(body['max'], 8000)
  assert.equal(h.modelCalls.length, 0)
})

test('life_setup: tam 8000 karakter kabul edilir, metin kesilmeden modele gider', async () => {
  const h = harness({ reply: '{"summary":"tamam","tasks":[{"title":"Rapor"}]}' })
  const text = 'b'.repeat(8000)
  const { status, body } = await read(await handleLifeSetup(h.route({ text: `  ${text}  ` })))

  assert.equal(status, 200)
  assert.deepEqual(body['proposal'], {
    summary: 'tamam', routines: [], goals: [], tasks: [{ title: 'Rapor', area: null }], rules: {}, unsupported: [],
  })
  assert.equal(h.modelCalls.length, 1)
  assert.equal(h.modelCalls[0]?.maxTokens, 8000)
  assert.equal(h.modelCalls[0]?.messages[0]?.content, `<plan>\n${text}\n</plan>`)
})

test('life_setup: çözümlenemeyen yanıt 502', async () => {
  const h = harness({ reply: 'Bunu yapamam.' })
  const { status, body } = await read(await handleLifeSetup(h.route({ text: 'Her gün spor' })))
  assert.equal(status, 502)
  assert.equal(body['error'], 'AI yanıtı çözümlenemedi')
})

test('life_setup: hak model çağrısından ÖNCE ayrılır, başarılı yanıt hak yakmaz işaretlenmez', async () => {
  const h = harness({ reply: '{"summary":"tamam"}' })
  const { status } = await read(await handleLifeSetup(h.route({ text: 'Her gün spor' })))
  assert.equal(status, 200)
  assert.deepEqual(h.ledgerEvents, ['begin', 'model'])
})

test('life_setup: hak ayrılamazsa 402, model çağrılmaz', async () => {
  const h = harness({ reply: '{"summary":"tamam"}', denyBegin: true })
  const { status, body } = await read(await handleLifeSetup(h.route({ text: 'Her gün spor' })))
  assert.equal(status, 402)
  assert.equal(body['code'], 'pro_required')
  assert.equal(h.modelCalls.length, 0)
})

test('life_setup: doğrulama hatası hak ayırmaz (begin çağrılmaz)', async () => {
  const h = harness()
  await handleLifeSetup(h.route({ text: '' }))
  assert.deepEqual(h.ledgerEvents, [])
})

test('life_setup: ayrıştırılamayan yanıt hak yakmaz (markFailed), maliyet yine işlenir', async () => {
  const h = harness({ reply: 'Bunu yapamam.' })
  const { status } = await read(await handleLifeSetup(h.route({ text: 'Her gün spor' })))
  assert.equal(status, 502)
  assert.deepEqual(h.ledgerEvents, ['begin', 'model', 'failed'])
})

test('life_setup: max_tokens ile kesilen yanıt geçerli JSON görünse bile 502 ve hak yakmaz', async () => {
  const h = harness({ reply: '{"summary":"yarım"}', stopReason: 'max_tokens' })
  const { status } = await read(await handleLifeSetup(h.route({ text: 'Her gün spor' })))
  assert.equal(status, 502)
  assert.deepEqual(h.ledgerEvents, ['begin', 'model', 'failed'])
})

// ---------- daily_report ----------

const FACTS = {
  date: '2026-10-05',
  energy: 3,
  items: [{ key: 'task:a', kind: 'task', title: 'Audit eğitimi', area: 'career', minutes: 60, expected: true, outcome: 'done', reason: null, program: null }],
}

const TEMPLATE = { source: 'template', headline: 'Şablon', went_well: [], postponed: [], suggestion: 's', future_self: 'f' }

const AI_REPLY = JSON.stringify({
  headline: 'Audit eğitimini yaptın.',
  went_well: ['Audit eğitimi tamamlandı.'],
  postponed: [],
  suggestion: 'Yarın aynı saatte devam et.',
  future_self: 'Bir adım ilerledin.',
})

test('daily_report: geçersiz tarih 400, satır okunmaz, model çağrılmaz', async () => {
  for (const date of [undefined, '2026-02-31', '05.10.2026']) {
    const h = harness({ row: { facts: FACTS, checkin: {}, narrative: null }, reply: AI_REPLY })
    const { status, body } = await read(await handleDailyReport(h.route({ type: 'daily_report', date })))
    assert.equal(status, 400)
    assert.equal(body['code'], 'invalid_date')
    assert.equal(h.modelCalls.length, 0)
  }
})

test('daily_report: satır yoksa 404', async () => {
  const h = harness({ reply: AI_REPLY })
  const { status, body } = await read(await handleDailyReport(h.route({ type: 'daily_report', date: '2026-10-05' })))
  assert.equal(status, 404)
  assert.equal(body['code'], 'report_not_found')
  assert.equal(h.modelCalls.length, 0)
})

test('daily_report: kullanılamaz olgular 404', async () => {
  const h = harness({ row: { facts: {}, checkin: {}, narrative: null }, reply: AI_REPLY })
  const { status } = await read(await handleDailyReport(h.route({ type: 'daily_report', date: '2026-10-05' })))
  assert.equal(status, 404)
  assert.equal(h.modelCalls.length, 0)
})

test('daily_report: saklanmış AI anlatısı model çağrılmadan döner', async () => {
  const stored = { source: 'ai', headline: 'Saklı', went_well: ['a'], postponed: [], suggestion: 's', future_self: 'f' }
  const h = harness({ row: { facts: FACTS, checkin: {}, narrative: stored }, reply: AI_REPLY })
  const { status, body } = await read(await handleDailyReport(h.route({ type: 'daily_report', date: '2026-10-05' })))

  assert.equal(status, 200)
  assert.deepEqual(body['narrative'], stored)
  assert.equal(h.modelCalls.length, 0)
  assert.equal(h.updates.length, 0)
})

test('daily_report: şablon anlatı varken model bir kez çağrılır, sonuç satıra yazılır', async () => {
  const h = harness({
    row: { facts: FACTS, checkin: {}, narrative: TEMPLATE },
    profile: { preferences: { planning: { about: 'Seri bozulması başarısızlık değil.' } } },
    reply: AI_REPLY,
  })
  const { status, body } = await read(await handleDailyReport(h.route({ type: 'daily_report', date: '2026-10-05' })))

  assert.equal(status, 200)
  const narrative = body['narrative'] as Record<string, unknown>
  assert.equal(narrative['source'], 'ai')
  assert.equal(narrative['headline'], 'Audit eğitimini yaptın.')

  assert.equal(h.modelCalls.length, 1)
  assert.match(JSON.stringify(h.modelCalls[0]?.system), /Seri bozulması başarısızlık değil/)
  assert.match(JSON.stringify(h.modelCalls[0]?.system), /Audit eğitimi/)

  assert.deepEqual(h.updates, [{ table: 'daily_reports', values: { narrative } }])
})

test('daily_report: narrative boşken de (cron yalnızca olguları yazmış) üretilir', async () => {
  const h = harness({ row: { facts: FACTS, checkin: {}, narrative: null }, reply: AI_REPLY })
  const { status } = await read(await handleDailyReport(h.route({ type: 'daily_report', date: '2026-10-05' })))
  assert.equal(status, 200)
  assert.equal(h.modelCalls.length, 1)
})

test('daily_report: çözümlenemeyen yanıt 502, satıra yazılmaz', async () => {
  const h = harness({ row: { facts: FACTS, checkin: {}, narrative: TEMPLATE }, reply: 'olmaz' })
  const { status } = await read(await handleDailyReport(h.route({ type: 'daily_report', date: '2026-10-05' })))
  assert.equal(status, 502)
  assert.equal(h.updates.length, 0)
})

test('daily_report: yazma hatası anlatıyı düşürmez', async () => {
  const h = harness({ row: { facts: FACTS, checkin: {}, narrative: null }, reply: AI_REPLY, writeError: 'yazılamadı' })
  const original = console.error
  console.error = () => {}
  try {
    const { status, body } = await read(await handleDailyReport(h.route({ type: 'daily_report', date: '2026-10-05' })))
    assert.equal(status, 200)
    assert.equal((body['narrative'] as Record<string, unknown>)['source'], 'ai')
  } finally {
    console.error = original
  }
})

test('daily_report: okuma hatası fırlatılır (index 500 verir)', async () => {
  const h = harness({ readError: 'bağlantı koptu' })
  await assert.rejects(handleDailyReport(h.route({ type: 'daily_report', date: '2026-10-05' })), /daily_reports okunamadı: bağlantı koptu/)
})

// ---------- model çağrısı: bütçe ve hak ----------

test('rotalar: model çağrısına giden maxTokens değerleri değişmedi', async () => {
  const cases: { name: string; run: (h: ReturnType<typeof harness>) => Promise<Response>; max: number; reply: string; task?: unknown }[] = [
    { name: 'daily_plan', run: (h) => handleDailyPlan(h.route({ type: 'daily_plan' })), max: 1500, reply: '[{"type":"general","message":"x"}]' },
    { name: 'brain_dump', run: (h) => handleBrainDump(h.route({ type: 'brain_dump', user_message: 'süt al' })), max: 2048, reply: '{"tasks":[]}' },
    { name: 'task_priority', run: (h) => handleTaskPriority(h.route({ type: 'task_priority' }), 't1'), max: 512, reply: '{"value_score":3}', task: { title: 'Rapor' } },
    { name: 'workout_plan', run: (h) => handleWorkoutPlan(h.route({ type: 'workout_plan' })), max: 4500, reply: '[{"type":"general","message":"x"}]' },
    { name: 'nutrition_chat', run: (h) => handleNutritionChat(h.route({ type: 'nutrition_chat' })), max: 4500, reply: '{"message":"merhaba"}' },
  ]
  for (const c of cases) {
    const h = harness({ task: c.task, reply: c.reply })
    const response = await c.run(h)
    assert.equal(response.status, 200, c.name)
    assert.equal(h.modelCalls.length, 1, c.name)
    assert.equal(h.modelCalls[0]?.maxTokens, c.max, c.name)
    assert.deepEqual(h.ledgerEvents, ['model'], c.name)
  }
})

test('rotalar: ayrıştırılamayan yanıtta markFailed çağrılır', async () => {
  const cases: { name: string; run: (h: ReturnType<typeof harness>) => Promise<Response>; task?: unknown }[] = [
    { name: 'daily_plan', run: (h) => handleDailyPlan(h.route({ type: 'daily_plan' })) },
    { name: 'brain_dump', run: (h) => handleBrainDump(h.route({ type: 'brain_dump', user_message: 'süt al' })) },
    { name: 'task_priority', run: (h) => handleTaskPriority(h.route({ type: 'task_priority' }), 't1'), task: { title: 'Rapor' } },
    { name: 'workout_plan', run: (h) => handleWorkoutPlan(h.route({ type: 'workout_plan' })) },
  ]
  for (const c of cases) {
    const h = harness({ task: c.task, reply: '' })
    await c.run(h)
    assert.ok(h.ledgerEvents.includes('failed'), c.name)
  }
})

test('ai_mode: yalnız düz nesne gövdeye eklenir', () => {
  assert.deepEqual(withAiMode({ a: 1 }, 'primary'), { a: 1, ai_mode: 'primary' })
  assert.deepEqual(withAiMode({ a: 1 }, 'fallback'), { a: 1, ai_mode: 'fallback' })
  assert.deepEqual(withAiMode([1], 'fallback'), [1])
  assert.equal(withAiMode(null, 'primary'), null)
  assert.equal(withAiMode('x', 'primary'), 'x')
})

test('ai_mode: model çağrılmadıysa alan eklenmez', () => {
  assert.deepEqual(withAiMode({ a: 1 }, null), { a: 1 })
})

// ---------- replan bağlamı ----------

const { loadPlanningRules, loadRoutineContext } = await import('../../supabase/functions/ai-suggest/planningContext.ts')

type Db = Parameters<typeof loadRoutineContext>[0]

/** Her tablo için sabit sonuç dönen, zincirlenebilir ve await edilebilir sahte istemci. */
function fakeDb(results: Record<string, { data?: unknown; error?: { message: string; code?: string } | null }>): Db {
  const chain = (result: unknown) => {
    const link: Record<string, unknown> = {}
    for (const method of ['eq', 'or', 'not']) link[method] = () => link
    link['maybeSingle'] = async () => result
    link['then'] = (resolve: (value: unknown) => unknown) => resolve(result)
    return link
  }
  return {
    from: (table: string) => ({ select: () => chain({ data: null, error: null, ...results[table] }) }),
  } as unknown as Db
}

test('replan bağlamı: korumalı bloklar ve asgari sürümler okunur', async () => {
  const db = fakeDb({
    routines: { data: [{ id: 'r1', is_protected: true, min_minutes: 20 }] },
    time_blocks: { data: [{ id: 'b1', routine_id: 'r1', label: 'Spor', start_time: '17:00:00', end_time: '18:00:00' }] },
  })
  const ctx = await loadRoutineContext(db, 'u1', '2026-10-05', '09:00')
  assert.deepEqual(ctx.protectedBlocks, [{ id: 'b1', start: '17:00', end: '18:00', label: 'Spor' }])
  assert.equal(ctx.minVersions.length, 1)
})

test('replan bağlamı: 065 uygulanmamışsa (kolon yok) boş döner, replan bozulmaz', async () => {
  const db = fakeDb({ routines: { error: { message: 'column routines.is_protected does not exist', code: '42703' } } })
  assert.deepEqual(await loadRoutineContext(db, 'u1', '2026-10-05', '09:00'), { protectedBlocks: [], minVersions: [] })
})

test('replan bağlamı: başka okuma hataları fırlatılır, korumasız devam edilmez', async () => {
  const routineFail = fakeDb({ routines: { error: { message: 'timeout', code: '57014' } } })
  await assert.rejects(loadRoutineContext(routineFail, 'u1', '2026-10-05', '09:00'), /routines okunamadı: timeout/)

  const blockFail = fakeDb({ routines: { data: [] }, time_blocks: { error: { message: 'kapandı' } } })
  await assert.rejects(loadRoutineContext(blockFail, 'u1', '2026-10-05', '09:00'), /time_blocks okunamadı: kapandı/)
})

test('replan bağlamı: kurallar profilden okunur, okunamazsa varsayılanla devam', async () => {
  const ok = fakeDb({ user_profiles: { data: { preferences: { theme: 'dark', planning: { max_deep_tasks: 2, about: 'Not' } } } } })
  assert.deepEqual(await loadPlanningRules(ok, 'u1'), { max_deep_tasks: 2, about: 'Not' })

  const none = fakeDb({ user_profiles: { data: { preferences: { theme: 'dark' } } } })
  assert.deepEqual(await loadPlanningRules(none, 'u1'), {})

  const original = console.error
  console.error = () => {}
  try {
    const failing = fakeDb({ user_profiles: { error: { message: 'x' } } })
    assert.deepEqual(await loadPlanningRules(failing, 'u1'), {})
  } finally {
    console.error = original
  }
})
