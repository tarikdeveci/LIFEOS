import { test } from 'node:test'
import assert from 'node:assert/strict'
import { callOpenAiCompat } from '../../supabase/functions/_shared/ai/llm/providers/openaiCompat.ts'
import { LlmError } from '../../supabase/functions/_shared/ai/llm/types.ts'
import type { ResolvedModel } from '../../supabase/functions/_shared/ai/llm/types.ts'

const model: ResolvedModel = {
  id: 'g',
  provider: 'openai_compat',
  apiModel: 'gem-1',
  baseUrl: 'https://example.test/v1',
  apiKeySecret: 'AI_KEY_G',
  inputPerMtok: 1,
  outputPerMtok: 1,
  cachedInputPerMtok: null,
  extraParams: { reasoning_effort: 'none' },
  apiKey: 'secret-key',
}

interface Seen { url: string; headers: Record<string, string>; body: Record<string, unknown> }

function fakeFetch(payload: unknown, status = 200): { fetchImpl: typeof fetch; seen: Seen[] } {
  const seen: Seen[] = []
  const fetchImpl = (async (url: string, init: { headers: Record<string, string>; body: string }) => {
    seen.push({ url, headers: init.headers, body: JSON.parse(init.body) as Record<string, unknown> })
    return new Response(JSON.stringify(payload), { status })
  }) as unknown as typeof fetch
  return { fetchImpl, seen }
}

const OK = { choices: [{ message: { content: 'merhaba' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }

test('openai: istek', async () => {
  const { fetchImpl, seen } = fakeFetch(OK)
  const result = await callOpenAiCompat(
    model,
    {
      system: [
        { type: 'text', text: 'SABIT', cache_control: { type: 'ephemeral' } },
        { type: 'text', text: 'DEGISKEN' },
      ],
      messages: [{ role: 'user', content: 'x' }],
      maxTokens: 77,
    },
    fetchImpl,
  )
  assert.equal(seen[0]?.url, 'https://example.test/v1/chat/completions')
  assert.equal(seen[0]?.headers['Authorization'], 'Bearer secret-key')
  assert.deepEqual(seen[0]?.body, {
    model: 'gem-1',
    max_tokens: 77,
    messages: [{ role: 'system', content: 'SABIT\n\nDEGISKEN' }, { role: 'user', content: 'x' }],
    reasoning_effort: 'none',
  })
  assert.equal(result.text, 'merhaba')
})

test('openai: araç', async () => {
  const call = (args: string) => ({
    choices: [{ message: { tool_calls: [{ function: { name: 't', arguments: args } }] }, finish_reason: 'tool_calls' }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  })
  const request = {
    system: 's',
    messages: [],
    maxTokens: 10,
    tool: { name: 't', description: 'd', schema: { type: 'object' }, strict: true },
  }
  const good = fakeFetch(call('{"a":1}'))
  const result = await callOpenAiCompat(model, request, good.fetchImpl)
  assert.deepEqual(good.seen[0]?.body['tools'], [
    { type: 'function', function: { name: 't', description: 'd', parameters: { type: 'object' }, strict: true } },
  ])
  assert.deepEqual(good.seen[0]?.body['tool_choice'], { type: 'function', function: { name: 't' } })
  assert.deepEqual(result.toolInput, { a: 1 })
  assert.equal(result.stopReason, 'tool')

  const broken = await callOpenAiCompat(model, request, fakeFetch(call('{bozuk')).fetchImpl)
  assert.equal(broken.toolInput, null)
})

test('openai: kullanım', async () => {
  const { fetchImpl } = fakeFetch({
    choices: [{ message: { content: 'x' }, finish_reason: 'length' }],
    usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 40 } },
  })
  const result = await callOpenAiCompat(model, { system: 's', messages: [], maxTokens: 1 }, fetchImpl)
  assert.deepEqual(result.usage, { input: 60, cacheRead: 40, cacheWrite: 0, output: 20 })
  assert.equal(result.stopReason, 'max_tokens')
})

test('openai: hata', async () => {
  const run = (fetchImpl: typeof fetch) =>
    callOpenAiCompat(model, { system: 's', messages: [], maxTokens: 1 }, fetchImpl).then(() => null, (e: unknown) => e)

  for (const status of [429, 503]) {
    const e = await run(fakeFetch({}, status).fetchImpl)
    assert.ok(e instanceof LlmError)
    assert.equal(e.retryable, true, String(status))
    assert.equal(e.status, status)
  }
  const bad = await run(fakeFetch({}, 400).fetchImpl)
  assert.ok(bad instanceof LlmError)
  assert.equal(bad.retryable, false)

  const net = await run((async () => { throw new Error('timeout') }) as unknown as typeof fetch)
  assert.ok(net instanceof LlmError)
  assert.equal(net.retryable, true)
  assert.equal(net.status, null)
})

test('openai: eksik mesaj ya da kullanım geçici hata sayılır', async () => {
  for (const bad of [
    { choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } },
    { choices: [{ message: { content: 'x' } }] },
    { choices: [{ message: { content: 'x' } }], usage: {} },
    {},
  ]) {
    const { fetchImpl } = fakeFetch(bad)
    await assert.rejects(
      callOpenAiCompat(model, { system: 's', messages: [], maxTokens: 1 }, fetchImpl),
      (e: unknown) => e instanceof LlmError && e.retryable,
    )
  }
})

test('openai: geçerli kullanımlı geçersiz mesaj hatası kullanımı taşır', async () => {
  const { fetchImpl } = fakeFetch({ choices: [], usage: { prompt_tokens: 9, completion_tokens: 4 } })
  await assert.rejects(
    callOpenAiCompat(model, { system: 's', messages: [], maxTokens: 1 }, fetchImpl),
    (e: unknown) => e instanceof LlmError && e.retryable && e.usage?.input === 9 && e.usage.output === 4,
  )
  const none = fakeFetch({ choices: [] })
  await assert.rejects(
    callOpenAiCompat(model, { system: 's', messages: [], maxTokens: 1 }, none.fetchImpl),
    (e: unknown) => e instanceof LlmError && e.usage === null,
  )
})
