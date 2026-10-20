import { test } from 'node:test'
import assert from 'node:assert/strict'
import { callAnthropic } from '../../supabase/functions/_shared/ai/llm/providers/anthropic.ts'
import { DEFAULT_MODELS } from '../../supabase/functions/_shared/ai/llm/defaults.ts'
import { LlmError } from '../../supabase/functions/_shared/ai/llm/types.ts'
import type { LlmRequest, ResolvedModel } from '../../supabase/functions/_shared/ai/llm/types.ts'

const opus: ResolvedModel = { ...DEFAULT_MODELS.find((m) => m.id === 'opus-5')!, apiKey: 'k' }

function capture(response: unknown): { create: (b: Record<string, unknown>) => Promise<unknown>; bodies: Record<string, unknown>[] } {
  const bodies: Record<string, unknown>[] = []
  return {
    bodies,
    create: async (b) => {
      bodies.push(b)
      return response
    },
  }
}

const EMPTY = { content: [], usage: {}, stop_reason: 'end_turn' }

test('anthropic: gövde', async () => {
  const system = [
    { type: 'text' as const, text: 'sabit', cache_control: { type: 'ephemeral' as const } },
    { type: 'text' as const, text: 'degisken' },
  ]
  const messages = [{ role: 'user' as const, content: 'selam' }]
  const fake = capture(EMPTY)
  await callAnthropic(opus, { system, messages, maxTokens: 100 }, { create: fake.create })
  assert.deepEqual(fake.bodies[0], {
    model: 'claude-opus-5',
    max_tokens: 100,
    system,
    messages,
    output_config: { effort: 'low' },
  })
})

test('anthropic: araç', async () => {
  const fake = capture({
    content: [{ type: 'tool_use', name: 't', input: { a: 1 } }],
    usage: {},
    stop_reason: 'tool_use',
  })
  const request: LlmRequest = {
    system: 's',
    messages: [{ role: 'user', content: 'x' }],
    maxTokens: 50,
    tool: { name: 't', description: 'd', schema: { type: 'object' }, strict: true },
  }
  const result = await callAnthropic(opus, request, { create: fake.create })
  assert.deepEqual(fake.bodies[0]?.['tools'], [
    { name: 't', description: 'd', input_schema: { type: 'object' }, strict: true },
  ])
  assert.deepEqual(fake.bodies[0]?.['tool_choice'], { type: 'tool', name: 't' })
  assert.deepEqual(result.toolInput, { a: 1 })
  assert.equal(result.stopReason, 'tool')
})

test('anthropic: kullanım', async () => {
  const fake = capture({
    content: [{ type: 'text', text: 'a' }, { type: 'thinking' }, { type: 'text', text: 'b' }],
    usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 3, cache_creation_input_tokens: 2 },
    stop_reason: 'max_tokens',
  })
  const result = await callAnthropic(opus, { system: 's', messages: [], maxTokens: 1 }, { create: fake.create })
  assert.deepEqual(result.usage, { input: 10, output: 5, cacheRead: 3, cacheWrite: 2 })
  assert.equal(result.stopReason, 'max_tokens')
  assert.equal(result.text, 'ab')
  assert.equal(result.toolInput, null)
})

test('anthropic: hata sınıflandırma', async () => {
  const run = (err: unknown) =>
    callAnthropic(opus, { system: 's', messages: [], maxTokens: 1 }, { create: async () => { throw err } })
      .then(() => null, (e: unknown) => e)

  for (const status of [429, 529, 500]) {
    const e = await run(Object.assign(new Error('x'), { status }))
    assert.ok(e instanceof LlmError)
    assert.equal(e.retryable, true, String(status))
    assert.equal(e.status, status)
  }
  const bad = await run(Object.assign(new Error('x'), { status: 400 }))
  assert.ok(bad instanceof LlmError)
  assert.equal(bad.retryable, false)
  const net = await run(new Error('ECONNRESET'))
  assert.ok(net instanceof LlmError)
  assert.equal(net.retryable, true)
  assert.equal(net.status, null)
})

test('resolver: npm: öneki', async () => {
  const mod = await import('npm:@anthropic-ai/sdk')
  assert.equal(typeof mod.default, 'function')
})
