// supabase/functions/_shared/ai/llm/generate.ts
//
// Tek giris noktasi: rota -> model -> adaptor. Butce asildiysa yedek model,
// birinci model gecici hata verirse bir kez yedek model.

import { costUsd } from './cost.ts'
import { callAnthropic } from './providers/anthropic.ts'
import { callOpenAiCompat } from './providers/openaiCompat.ts'
import { LlmError } from './types.ts'
import type { AiRouter } from './router.ts'
import type {
  AiRoute,
  LlmCall,
  LlmRequest,
  LlmResult,
  ProviderResult,
  ResolvedModel,
} from './types.ts'

type ProviderFn = (model: ResolvedModel, request: LlmRequest) => Promise<ProviderResult>

export interface GenerateOptions {
  /** Aylik butce asildi: yedek model varsa onunla calis. */
  overBudget: boolean
  /** Basarili sonuc geldiginde bir kez cagrilir (maliyet defteri). */
  onResult?: (result: LlmResult) => void
  /** Testler icin adaptor yerine koyma. */
  providers?: Partial<Record<ResolvedModel['provider'], ProviderFn>>
}

const DEFAULT_PROVIDERS: Record<ResolvedModel['provider'], ProviderFn> = {
  anthropic: (model, request) => callAnthropic(model, request),
  openai_compat: (model, request) => callOpenAiCompat(model, request),
}

export async function generate(
  router: AiRouter,
  route: AiRoute,
  request: LlmRequest,
  options: GenerateOptions,
): Promise<LlmResult> {
  const { primary, fallback } = await router.resolve(route)
  const providers = { ...DEFAULT_PROVIDERS, ...options.providers }

  async function run(model: ResolvedModel, mode: LlmResult['mode']): Promise<LlmResult> {
    const call = providers[model.provider]
    if (!call) throw new LlmError(`Bilinmeyen saglayici: ${model.provider}`, null, false)
    const provider = await call(model, request)
    const result: LlmResult = {
      ...provider,
      route,
      modelId: model.id,
      apiModel: model.apiModel,
      costUsd: costUsd(model, provider.usage),
      mode,
    }
    options.onResult?.(result)
    return result
  }

  if (options.overBudget && fallback) return run(fallback, 'fallback')
  try {
    return await run(primary, 'primary')
  } catch (err) {
    // Yedek yoksa bugunku hata davranisi aynen: ikinci deneme yok.
    if (fallback && err instanceof LlmError && err.retryable) return run(fallback, 'fallback')
    throw err
  }
}

export function bindRoute(
  router: AiRouter,
  route: AiRoute,
  options: Omit<GenerateOptions, 'providers'>,
): LlmCall {
  return (request) => generate(router, route, request, options)
}
