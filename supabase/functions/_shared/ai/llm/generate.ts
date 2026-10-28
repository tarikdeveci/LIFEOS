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
  onResult?: (result: LlmResult) => void | Promise<void>
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
  const { primary, fallback, cheap } = await router.resolve(route)
  const providers = { ...DEFAULT_PROVIDERS, ...options.providers }

  async function run(model: ResolvedModel, mode: LlmResult['mode']): Promise<LlmResult> {
    const call = providers[model.provider]
    if (!call) throw new LlmError(`Bilinmeyen saglayici: ${model.provider}`, null, false)
    const describe = (provider: ProviderResult): LlmResult => ({
      ...provider,
      route,
      modelId: model.id,
      apiModel: model.apiModel,
      costUsd: costUsd(model, provider.usage),
      mode,
    })
    const record = async (result: LlmResult) => {
      try {
        await options.onResult?.(result)
      } catch (err) {
        // Defter hatasi kullanicinin istegini bozmaz.
        console.error('AI sonuc kaydi basarisiz:', err instanceof Error ? err.message : err)
      }
    }

    let provider: ProviderResult
    try {
      provider = await call(model, request)
    } catch (err) {
      // Token harcandi ama icerik kullanilamadi: yedek calissa da bu deneme
      // de faturalanir, deftere bos metinli ayri bir cagri olarak yazilir.
      if (err instanceof LlmError && err.usage) {
        await record(describe({ text: '', toolInput: null, usage: err.usage, stopReason: 'end' }))
      }
      throw err
    }
    const result = describe(provider)
    await record(result)
    return result
  }

  // Butce bitti: birinciden ucuz olan ayarli yedek, yoksa koddaki ucuz model; ikisi de
  // pahaliysa birinci kalir. Birinci ucuz saglayicida (Gemini), yedek Anthropic'te
  // olabilir: butceyi asan kullanici pahali yedege kaymaz, hata aninda yine yedege gecer.
  const cheaperThanPrimary = (model: ResolvedModel | null) =>
    model && model.outputPerMtok < primary.outputPerMtok ? model : null
  const budgetModel = cheaperThanPrimary(fallback) ?? cheaperThanPrimary(cheap)
  if (options.overBudget && budgetModel) return run(budgetModel, 'fallback')
  try {
    return await run(primary, 'primary')
  } catch (err) {
    // Yedek yoksa bugunku hata davranisi aynen: ikinci deneme yok. Kalici hatalar
    // (kredi bitti 400, anahtar iptal 401/403, model kalkti 404) da yedege gecer:
    // yedek baska saglayicida olabilir, beslenme ve oneriler tek hesaba bagli kalmasin.
    if (fallback && err instanceof LlmError) return run(fallback, 'fallback')
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
