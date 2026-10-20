// supabase/functions/_shared/ai/llm/types.ts
//
// Saglayicidan bagimsiz LLM katmaninin tipleri. Model secimi ve fiyat bu
// tiplerin disinda (ai_models / ai_model_routes tablolari) durur.

import type { AnthropicMessage, SystemBlock } from '../coach.ts'

export type AiRoute =
  | 'daily_plan'
  | 'replan'
  | 'brain_dump'
  | 'task_priority'
  | 'workout_plan'
  | 'workout_program_chat'
  | 'nutrition_chat'
  | 'life_setup'
  | 'daily_report'
  | 'meal_extract'
  | 'meal_verify'
  | 'meal_portion'
  | 'meal_estimate'

export const AI_ROUTES: readonly AiRoute[] = [
  'daily_plan',
  'replan',
  'brain_dump',
  'task_priority',
  'workout_plan',
  'workout_program_chat',
  'nutrition_chat',
  'life_setup',
  'daily_report',
  'meal_extract',
  'meal_verify',
  'meal_portion',
  'meal_estimate',
]

export interface ModelSpec {
  id: string
  provider: 'anthropic' | 'openai_compat'
  apiModel: string
  baseUrl: string | null
  apiKeySecret: string
  /** USD / 1M girdi token. */
  inputPerMtok: number
  /** USD / 1M cikti token. */
  outputPerMtok: number
  /** Bos ise onbellekli girdi normal girdi fiyatindan sayilir. */
  cachedInputPerMtok: number | null
  /** Isteye oldugu gibi eklenir (thinking, output_config, temperature...). */
  extraParams: Record<string, unknown>
}

export interface ResolvedModel extends ModelSpec {
  apiKey: string
}

export interface LlmTool {
  name: string
  description: string
  schema: Record<string, unknown>
  strict?: boolean
}

export interface LlmRequest {
  system: string | SystemBlock[]
  messages: AnthropicMessage[]
  maxTokens: number
  tool?: LlmTool
}

export interface LlmUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export interface ProviderResult {
  text: string
  toolInput: Record<string, unknown> | null
  usage: LlmUsage
  stopReason: 'end' | 'max_tokens' | 'tool'
}

export interface LlmResult extends ProviderResult {
  route: AiRoute
  modelId: string
  apiModel: string
  costUsd: number
  mode: 'primary' | 'fallback'
}

/**
 * Saglayici cagrisi hatasi. `retryable`: yedek modele gecmeye deger (429, 5xx,
 * zaman asimi, ag). 4xx istek hatalari yedekte de ayni sekilde duser.
 * (Alanlar acik tanimli: Node'un strip-only modu parametre ozelligi desteklemiyor.)
 */
export class LlmError extends Error {
  status: number | null
  retryable: boolean

  constructor(message: string, status: number | null, retryable: boolean) {
    super(message)
    this.name = 'LlmError'
    this.status = status
    this.retryable = retryable
  }
}

export type LlmCall = (request: LlmRequest) => Promise<LlmResult>
