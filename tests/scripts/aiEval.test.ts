import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

import { DEFAULT_MODELS } from '../../supabase/functions/_shared/ai/llm/defaults.ts'
import type { LlmRequest, LlmResult, ModelSpec, ProviderResult, ResolvedModel } from '../../supabase/functions/_shared/ai/llm/types.ts'

const { loadModels, runEval, writeReport } = await import('../../scripts/ai-eval/run.ts')
const { taskPriorityEval } = await import('../../scripts/ai-eval/routes/task_priority.ts')
const { brainDumpEval } = await import('../../scripts/ai-eval/routes/brain_dump.ts')

const fixtures = (name: string): unknown[] =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../scripts/ai-eval/fixtures/${name}.json`, import.meta.url)), 'utf8')) as unknown[]

const spec = (id: string): ModelSpec => {
  const found = DEFAULT_MODELS.find((m) => m.id === id)
  if (!found) throw new Error(id)
  return { ...found, id }
}
const baseline = spec('sonnet-5-nothink')
const candidate: ModelSpec = { ...spec('sonnet-5-nothink'), id: 'aday', inputPerMtok: 1, outputPerMtok: 2 }

const GOOD = '{"value_score":4,"urgency_score":3,"risk_score":2,"effort_score":2,"friction_score":1,"reasoning":"x"}'

function reply(text: string, output = 100, stopReason: ProviderResult['stopReason'] = 'end'): ProviderResult {
  return { text, toolInput: null, usage: { input: 1000, output, cacheRead: 0, cacheWrite: 0 }, stopReason }
}

/** Rota kontrolleri bindModel çıktısını alır: sağlayıcı sonucuna rota ve maliyet alanları eklenir. */
function result(text: string): LlmResult {
  return { ...reply(text), route: 'task_priority', modelId: 'x', apiModel: 'x', costUsd: 0, mode: 'primary' }
}

/** Adayın ilk `bad` çağrısı ayrıştırılamaz metin döner; referans hep geçerli. */
function fakeCall(bad: number) {
  let candidateCalls = 0
  return async (model: ResolvedModel, _request: LlmRequest): Promise<ProviderResult> => {
    if (model.id === candidate.id) {
      candidateCalls++
      if (candidateCalls <= bad) return reply('anlamadım')
    }
    return reply(GOOD)
  }
}

const tenTasks = Array.from({ length: 10 }, (_, i) => ({ title: `Görev ${i + 1}` }))

test('eval: oranlar', async () => {
  const failing = await runEval({ route: 'task_priority', model: candidate, baseline, cases: tenTasks, call: fakeCall(1) })
  assert.equal(failing.parseRate.candidate, 0.9)
  assert.equal(failing.parseRate.baseline, 1)
  assert.equal(failing.checkRates['value_score']?.candidate, 0.9)
  assert.equal(failing.verdict, 'FAIL')

  const passing = await runEval({ route: 'task_priority', model: candidate, baseline, cases: tenTasks, call: fakeCall(0) })
  assert.equal(passing.parseRate.candidate, 1)
  assert.equal(passing.verdict, 'PASS')
  assert.equal(passing.pairs.length, 10)
  assert.deepEqual(passing.pairs[0]?.input, { title: 'Görev 1' })
  // 1000 girdi ve 100 çıktı token: aday 1/2 USD, referans 2/10 USD (1M token başına).
  assert.ok(Math.abs(passing.avgCostUsd.candidate - 0.0012) < 1e-12)
  assert.ok(Math.abs(passing.avgCostUsd.baseline - 0.003) < 1e-12)
})

test('eval: kontrolde aday geride kalırsa FAIL', async () => {
  const call = async (model: ResolvedModel): Promise<ProviderResult> =>
    reply(model.id === candidate.id ? GOOD.replace('"risk_score":2', '"risk_score":7') : GOOD)
  const report = await runEval({ route: 'task_priority', model: candidate, baseline, cases: tenTasks, call })
  assert.equal(report.parseRate.candidate, 1)
  assert.equal(report.checkRates['risk_score']?.candidate, 0)
  assert.equal(report.verdict, 'FAIL')
})

test('eval: max_tokens oranı ve hata veren çağrı', async () => {
  let n = 0
  const call = async (model: ResolvedModel): Promise<ProviderResult> => {
    if (model.id !== candidate.id) return reply(GOOD)
    n++
    if (n === 1) throw new Error('HTTP 529')
    return reply(GOOD, 100, n === 2 ? 'max_tokens' : 'end')
  }
  const report = await runEval({ route: 'task_priority', model: candidate, baseline, cases: tenTasks.slice(0, 4), call })
  assert.equal(report.parseRate.candidate, 0.75)
  assert.equal(report.maxTokensRate.candidate, 0.25)
  assert.equal(report.pairs[0]?.candidate.error, 'HTTP 529')
})

test('eval: düşünme oranı', async () => {
  const outputs = [10, 20]
  let i = 0
  // 100 karakterlik metin: 100/10 = 10 ve 100/20 = 5, ortalama 7,5.
  const text = `{"tasks":[${'"x",'.repeat(20)}"y"]}`.padEnd(100, ' ')
  const call = async (model: ResolvedModel): Promise<ProviderResult> =>
    reply(text, model.id === candidate.id ? outputs[i++ % 2]! : 50)
  const report = await runEval({
    route: 'brain_dump',
    model: candidate,
    baseline,
    cases: [{ text: 'a', expect_count: 21 }, { text: 'b', expect_count: 21 }],
    call,
  })
  assert.equal(report.thinkingRatio.candidate, 7.5)
  assert.equal(report.thinkingRatio.baseline, 2)
})

test('eval: rapor geçici klasörde', async () => {
  const report = await runEval({ route: 'task_priority', model: candidate, baseline, cases: tenTasks, call: fakeCall(0) })
  const paths = await writeReport(report)
  try {
    assert.ok(paths.json.startsWith(tmpdir()))
    assert.ok(paths.markdown.startsWith(tmpdir()))
    const markdown = readFileSync(paths.markdown, 'utf8')
    assert.match(markdown, /PASS/)
    assert.doesNotMatch(markdown, /[\u2013\u2014]/)
    const saved = JSON.parse(readFileSync(paths.json, 'utf8')) as { verdict: string }
    assert.equal(saved.verdict, 'PASS')
  } finally {
    rmSync(paths.dir, { recursive: true, force: true })
  }
})

test('eval: task_priority kontrolleri', () => {
  const ok = taskPriorityEval.check(result(GOOD), { title: 'x' })
  assert.equal(ok.parsed, true)
  assert.deepEqual(Object.values(ok.checks), [true, true, true, true, true])

  const fractional = taskPriorityEval.check(result(GOOD.replace('"effort_score":2', '"effort_score":2.5')), { title: 'x' })
  assert.equal(fractional.checks['effort_score'], false)

  const prose = taskPriorityEval.check(result('{bozuk json'), { title: 'x' })
  assert.equal(prose.parsed, false)
  assert.equal(taskPriorityEval.check(result('{"reasoning":"x"'), { title: 'x' }).parsed, false)
  assert.equal(taskPriorityEval.check(result(''), { title: 'x' }).parsed, false)

  const request = taskPriorityEval.build({ title: 'Faturayı öde', due_date: '2026-11-03' })
  assert.equal(request.maxTokens, 512)
  assert.match(String(request.messages[0]?.content), /Faturayı öde/)
})

test('eval: brain_dump görev sayısı ±1', () => {
  const three = '{"tasks":[{"title":"a"},{"title":"b"},{"title":"c"}]}'
  assert.equal(brainDumpEval.check(result(three), { text: 'x', expect_count: 4 }).checks['count'], true)
  assert.equal(brainDumpEval.check(result(three), { text: 'x', expect_count: 2 }).checks['count'], true)
  assert.equal(brainDumpEval.check(result(three), { text: 'x', expect_count: 5 }).checks['count'], false)
  assert.equal(brainDumpEval.check(result('yok'), { text: 'x', expect_count: 1 }).parsed, false)
  assert.equal(brainDumpEval.build({ text: '  süt al  ', expect_count: 1 }).messages[0]?.content, 'süt al')
})

test('eval: fixture dosyaları rota başına en az 10 sentetik vaka', () => {
  const priority = fixtures('task_priority')
  const dump = fixtures('brain_dump')
  assert.ok(priority.length >= 10)
  assert.ok(dump.length >= 10)
  for (const c of priority) assert.equal(typeof (c as { title: unknown }).title, 'string')
  for (const c of dump) {
    const { text, expect_count } = c as { text: unknown; expect_count: unknown }
    assert.equal(typeof text, 'string')
    assert.ok(Number.isInteger(expect_count))
  }
  // Hiçbir metinde uzun ya da orta tire yok.
  assert.doesNotMatch(JSON.stringify([priority, dump]), /[\u2013\u2014]/)
})

test('eval: katalog dosyası varsayılanları id ile ezer, bozuk satırı reddeder', () => {
  const extra = {
    id: 'ucuz',
    provider: 'openai_compat',
    apiModel: 'x-mini',
    baseUrl: 'https://api.example.com/v1',
    apiKeySecret: 'AI_KEY_EXAMPLE',
    inputPerMtok: 0.1,
    outputPerMtok: 0.4,
    cachedInputPerMtok: null,
    extraParams: {},
  }
  const models = loadModels([extra, { ...DEFAULT_MODELS[0], outputPerMtok: 99 }])
  assert.equal(models.find((m) => m.id === 'ucuz')?.apiModel, 'x-mini')
  assert.equal(models.find((m) => m.id === DEFAULT_MODELS[0]?.id)?.outputPerMtok, 99)
  assert.equal(models.length, DEFAULT_MODELS.length + 1)

  assert.throws(() => loadModels([{ ...extra, baseUrl: 'http://api.example.com' }]), /https/)
  assert.throws(() => loadModels([{ ...extra, apiKeySecret: 'OPENAI_KEY' }]), /AI_KEY_/)
  assert.throws(() => loadModels([{ ...extra, apiKeySecret: 'AI_KEY_ANTHROPIC' }]), /Anthropic/)
  assert.throws(() => loadModels({ id: 'x' }), /dizi/)
})
