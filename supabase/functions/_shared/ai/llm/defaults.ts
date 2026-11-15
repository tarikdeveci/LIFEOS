// supabase/functions/_shared/ai/llm/defaults.ts
//
// ai_models / ai_model_routes tablolari okunamazsa (ya da bir satir bozuksa)
// router bu eslemeye duser: ayar hatasi AI'i durdurmaz. Icerik migration 072'nin
// ilk verisiyle birebir ayni olmali (tests/functions/llmDefaults.test.ts).

import type { AiRoute, ModelSpec } from './types.ts'

const THINK_LOW = { output_config: { effort: 'low' } }
const NO_THINK = { thinking: { type: 'disabled' } }

function anthropic(
  id: string,
  apiModel: string,
  inputPerMtok: number,
  outputPerMtok: number,
  extraParams: Record<string, unknown>,
): ModelSpec {
  return {
    id,
    provider: 'anthropic',
    apiModel,
    baseUrl: null,
    apiKeySecret: 'AI_KEY_ANTHROPIC',
    inputPerMtok,
    outputPerMtok,
    cachedInputPerMtok: null,
    extraParams,
  }
}

export const DEFAULT_MODELS: readonly ModelSpec[] = [
  anthropic('opus-5', 'claude-opus-5', 5, 25, THINK_LOW),
  anthropic('opus-5-nothink', 'claude-opus-5', 5, 25, NO_THINK),
  anthropic('sonnet-5', 'claude-sonnet-5', 2, 10, THINK_LOW),
  anthropic('sonnet-5-nothink', 'claude-sonnet-5', 2, 10, NO_THINK),
  anthropic('opus-4-6', 'claude-opus-4-6', 5, 25, { temperature: 0 }),
]

export const DEFAULT_ROUTES: Readonly<Record<AiRoute, { primary: string; fallback: string | null }>> = {
  daily_plan: { primary: 'sonnet-5-nothink', fallback: null },
  replan: { primary: 'opus-5', fallback: 'sonnet-5' },
  brain_dump: { primary: 'opus-5-nothink', fallback: 'sonnet-5-nothink' },
  task_priority: { primary: 'sonnet-5-nothink', fallback: null },
  workout_plan: { primary: 'opus-5', fallback: 'sonnet-5' },
  workout_program_chat: { primary: 'opus-5', fallback: 'sonnet-5' },
  nutrition_chat: { primary: 'opus-5', fallback: 'sonnet-5' },
  life_setup: { primary: 'opus-5', fallback: 'sonnet-5' },
  daily_report: { primary: 'opus-5', fallback: 'sonnet-5' },
  meal_extract: { primary: 'opus-4-6', fallback: 'sonnet-5-nothink' },
  meal_verify: { primary: 'sonnet-5-nothink', fallback: null },
  meal_portion: { primary: 'sonnet-5-nothink', fallback: null },
  meal_estimate: { primary: 'opus-4-6', fallback: 'sonnet-5-nothink' },
}
