// supabase/functions/_shared/ai/llm/cost.ts

import type { LlmUsage, ModelSpec } from './types.ts'

/**
 * Bir cagrinin USD maliyeti.
 *
 * Anthropic: onbellek yazimi (5 dk) girdi fiyatinin 1,25 kati, okumasi 0,1 kati.
 * OpenAI uyumlu: onbellekli girdi `cachedInputPerMtok` ile, yoksa normal girdi
 * fiyatiyla sayilir. Adaptor `input`'u onbellek HARIC verir (prompt_tokens
 * onbellekliyi de icerir).
 * Dusunme token'lari ciktiya dahil gelir ve cikti fiyatindan odenir.
 */
export function costUsd(model: ModelSpec, usage: LlmUsage): number {
  const { inputPerMtok: inp, outputPerMtok: out } = model
  if (model.provider === 'anthropic') {
    return (
      usage.input * inp
      + usage.cacheWrite * inp * 1.25
      + usage.cacheRead * inp * 0.1
      + usage.output * out
    ) / 1_000_000
  }
  const cached = model.cachedInputPerMtok ?? inp
  return (usage.input * inp + usage.cacheRead * cached + usage.output * out) / 1_000_000
}
