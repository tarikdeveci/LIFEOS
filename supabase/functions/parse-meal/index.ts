// supabase/functions/parse-meal/index.ts
//
// Serbest metin öğün girişini kanonik yiyeceklere, porsiyon ARALIĞINA ve besin
// değerine çevirir.
//
// Eski sürümde model doğrudan kalori/makro yazıyordu; tek koruma 10.000 kcal
// üst sınırıydı. Yeni hatta model sayı yazamaz: besin değeri yalnızca
// food_items / food_corpus satırlarından hesaplanır (_shared/nutrition).
//
// İki katman:
//   • Deterministik katman — herkese açık, anahtarsız, ağsız. Kural çıkarıcı +
//     küratörlü sözlük + porsiyon merdiveni. Sağlayıcı kesintisinde de çalışır.
//   • Model katmanı — yalnızca Pro. Çıkarım + kapalı listeden doğrulama + gram
//     tahmini. Hata verirse deterministik katmana düşülür, istek 500 olmaz.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.2'

import { createRulesExtractor, parseMeal } from '../_shared/nutrition/index.ts'
import { createSupabaseFoodRepo, type SupabaseLike } from '../_shared/nutrition/repo.ts'
import {
  createAnthropicExtractor,
  createAnthropicPortionEstimator,
  createAnthropicVerifier,
} from '../_shared/nutrition/adapters/anthropic.ts'
import type { ParseMealResult } from '../_shared/nutrition/types.ts'

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://lifeos.tr',
  'https://www.lifeos.tr',
]

const DEFAULT_MODEL = 'claude-opus-4-6'

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]!
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Credentials': 'true',
  }
}

interface ParseRequest {
  raw_input: string
  user_id: string
}

async function isProUser(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('subscriptions')
    .select('status, current_period_end')
    .eq('user_id', userId)
    .maybeSingle()

  const active = data?.status === 'pro_monthly' || data?.status === 'pro_annual'
  const periodEnd = typeof data?.current_period_end === 'string' ? data.current_period_end : null
  const notExpired = periodEnd !== null && new Date(periodEnd) > new Date()

  return active && notExpired
}

/** Model kesintisinin kullanıcıya gösterilecek sebebi — sessizce yutulmaz. */
function classifyAiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/credit balance|insufficient|quota/i.test(message)) return 'credit'
  if (/rate.?limit|429/i.test(message)) return 'rate_limit'
  if (/api key|401|403|authentication/i.test(message)) return 'auth'
  if (/timeout|network|fetch failed|ECONN/i.test(message)) return 'network'
  return 'unknown'
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Yetkisiz erişim' }, 401)

    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return json({ error: 'Yetkisiz erişim' }, 401)

    const { raw_input, user_id }: ParseRequest = await req.json()
    if (!raw_input || !user_id) return json({ error: 'raw_input ve user_id gerekli' }, 400)
    if (user.id !== user_id) return json({ error: 'Yetkisiz erişim' }, 403)

    // Ölçüm: öğün parse en çok kullanılan AI özelliği. authClient kullanıcının
    // JWT'siyle çalışıyor, events tablosunun RLS insert politikasından geçiyor.
    try {
      await authClient.from('events').insert({ user_id, name: 'ai_used', props: { kind: 'parse_meal' } })
    } catch { /* ölçüm asıl işi bozmaz */ }

    // Service role: RLS'i aşar, sorgular yine user_id ile daraltılır.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const repo = createSupabaseFoodRepo(supabase as unknown as SupabaseLike, user_id)

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
    const model = Deno.env.get('NUTRITION_MODEL') ?? DEFAULT_MODEL
    const pro = await isProUser(authClient, user.id)
    const modelTierAvailable = pro && apiKey.length > 0

    let result: ParseMealResult | null = null
    let aiError: string | null = null

    if (modelTierAvailable) {
      try {
        result = await parseMeal(raw_input, {
          repo,
          extractor: createAnthropicExtractor({ apiKey, model }),
          verifier: createAnthropicVerifier({ apiKey, model }),
          portionEstimator: createAnthropicPortionEstimator({ apiKey, model }),
        })
      } catch (error) {
        // 23 Ağustos dersi: kredi bittiğinde beslenme tamamen ölmemeli.
        aiError = classifyAiError(error)
        console.error('parse-meal model katmanı düştü:', aiError, error)
      }
    }

    if (!result) {
      result = await parseMeal(raw_input, {
        repo,
        extractor: createRulesExtractor(),
        verifier: null,
        portionEstimator: null,
      })
    }

    return json({
      ...result,
      ai: {
        // Model katmanı gerçekten çalıştı mı — Pro olmak tek başına yetmiyor
        enabled: modelTierAvailable && aiError === null,
        pro,
        error: aiError,
        model: modelTierAvailable && aiError === null ? model : null,
      },
    })
  } catch (error) {
    console.error('parse-meal error:', error)
    return json({ error: 'Öğün parse edilirken bir hata oluştu' }, 500)
  }
})
