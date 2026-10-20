import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generate } from '../../supabase/functions/_shared/ai/llm/generate.ts'
import { DEFAULT_MODELS } from '../../supabase/functions/_shared/ai/llm/defaults.ts'
import { costUsd } from '../../supabase/functions/_shared/ai/llm/cost.ts'
import { LlmError } from '../../supabase/functions/_shared/ai/llm/types.ts'
import type { AiRouter } from '../../supabase/functions/_shared/ai/llm/router.ts'
import type { LlmResult, ProviderResult, ResolvedModel } from '../../supabase/functions/_shared/ai/llm/types.ts'

function resolved(id: string): ResolvedModel {
  return { ...DEFAULT_MODELS.find((m) => m.id === id)!, apiKey: 'k' }
}

function routerOf(primary: string, fallback: string | null): AiRouter {
  return { resolve: async () => ({ primary: resolved(primary), fallback: fallback ? resolved(fallback) : null }) }
}

const USAGE = { input: 1000, output: 500, cacheRead: 0, cacheWrite: 0 }
const OK: ProviderResult = { text: 'tamam', toolInput: null, usage: USAGE, stopReason: 'end' }
const REQUEST = { system: 's', messages: [], maxTokens: 10 }

function providers(handler: (model: ResolvedModel) => Promise<ProviderResult>) {
  const calls: string[] = []
  return {
    calls,
    providers: {
      anthropic: async (model: ResolvedModel) => {
        calls.push(model.id)
        return handler(model)
      },
    },
  }
}

test('generate: bütçe içi birinci', async () => {
  const p = providers(async () => OK)
  const result = await generate(routerOf('opus-5', 'sonnet-5'), 'replan', REQUEST, { overBudget: false, providers: p.providers })
  assert.equal(result.mode, 'primary')
  assert.equal(result.modelId, 'opus-5')
  assert.deepEqual(p.calls, ['opus-5'])
})

test('generate: bütçe aşımı yedek', async () => {
  const p = providers(async () => OK)
  const fb = await generate(routerOf('opus-5', 'sonnet-5'), 'replan', REQUEST, { overBudget: true, providers: p.providers })
  assert.equal(fb.mode, 'fallback')
  assert.equal(fb.modelId, 'sonnet-5')

  const none = await generate(routerOf('opus-5', null), 'replan', REQUEST, { overBudget: true, providers: p.providers })
  assert.equal(none.mode, 'primary')
  assert.equal(none.modelId, 'opus-5')
})

test('generate: hata anında yedek', async () => {
  const results: LlmResult[] = []
  const p = providers(async (model) => {
    if (model.id === 'opus-5') throw new LlmError('asiri yuk', 529, true)
    return OK
  })
  const result = await generate(routerOf('opus-5', 'sonnet-5'), 'replan', REQUEST, {
    overBudget: false,
    providers: p.providers,
    onResult: (r) => results.push(r),
  })
  assert.equal(result.mode, 'fallback')
  assert.deepEqual(p.calls, ['opus-5', 'sonnet-5'])
  assert.equal(results.length, 1)
})

test('generate: yedek yoksa hata aynen', async () => {
  const error = new LlmError('429', 429, true)
  const p = providers(async () => { throw error })
  await assert.rejects(
    generate(routerOf('opus-5', null), 'replan', REQUEST, { overBudget: false, providers: p.providers }),
    (e: unknown) => e === error,
  )
  assert.deepEqual(p.calls, ['opus-5'])

  const fatal = new LlmError('400', 400, false)
  const q = providers(async () => { throw fatal })
  await assert.rejects(
    generate(routerOf('opus-5', 'sonnet-5'), 'replan', REQUEST, { overBudget: false, providers: q.providers }),
    (e: unknown) => e === fatal,
  )
  assert.deepEqual(q.calls, ['opus-5'])
})

test('generate: maliyet', async () => {
  const p = providers(async () => OK)
  const result = await generate(routerOf('opus-5', null), 'replan', REQUEST, { overBudget: false, providers: p.providers })
  assert.equal(result.costUsd, costUsd(resolved('opus-5'), USAGE))
  assert.equal(result.route, 'replan')
  assert.equal(result.apiModel, 'claude-opus-5')
})
