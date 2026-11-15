import { test } from 'node:test'
import assert from 'node:assert/strict'
import { costUsd } from '../../supabase/functions/_shared/ai/llm/cost.ts'
import { DEFAULT_MODELS } from '../../supabase/functions/_shared/ai/llm/defaults.ts'
import type { ModelSpec } from '../../supabase/functions/_shared/ai/llm/types.ts'

test('cost: anthropic önbellek yazma 1,25x, okuma 0,1x', () => {
  const opus = DEFAULT_MODELS.find((m) => m.id === 'opus-5')!
  // replan ortalaması (spec 3): 1105 girdi, 866 yazma, 99 okuma, 492 çıktı
  assert.equal(
    Math.round(costUsd(opus, { input: 1105, cacheWrite: 866, cacheRead: 99, output: 492 }) * 1e4) / 1e4,
    0.0233,
  )
})

test('cost: openai_compat önbellekli girdi, fiyatı yoksa normal girdi', () => {
  const base = DEFAULT_MODELS[0]!
  const m: ModelSpec = { ...base, provider: 'openai_compat', inputPerMtok: 1, outputPerMtok: 4, cachedInputPerMtok: null }
  assert.equal(costUsd(m, { input: 1_000_000, cacheRead: 1_000_000, cacheWrite: 0, output: 0 }), 2)
  assert.equal(costUsd({ ...m, cachedInputPerMtok: 0.25 }, { input: 0, cacheRead: 1_000_000, cacheWrite: 0, output: 0 }), 0.25)
})
