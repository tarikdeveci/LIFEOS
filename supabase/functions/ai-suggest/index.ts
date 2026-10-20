// supabase/functions/ai-suggest/index.ts
// Claude AI ile görev önceliklendirme, planlama ve koç sohbetleri
// Client'tan çağrılır (auth header ile)
//
// Prompt'lar ve yanıt ayrıştırma _shared/ai/coach.ts içinde. Buradaki iş:
// yetkilendirme, erişim kararı ve yönlendirme. Veritabanından bağlam toplama,
// modele gitme ve yanıtı döndürme rota modüllerinde: planning.ts, tasks.ts,
// workout.ts, nutrition.ts, lifeSetup.ts, dailyReport.ts.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.2'
import type { Lang } from '../_shared/ai/coach.ts'
import { bindRoute, getRouter } from '../_shared/ai/llm/index.ts'
import { AiLedger, resolveAiAccess } from '../_shared/ai/usage.ts'
import { isIsoDate, localDate } from '../_shared/ai/muscleLoad.ts'
import { getCorsHeaders } from './cors.ts'
import { handleDailyReport } from './dailyReport.ts'
import { handleLifeSetup } from './lifeSetup.ts'
import { handleNutritionChat } from './nutrition.ts'
import { handleDailyPlan, handleReplan } from './planning.ts'
import { withAiMode, type RouteContext, type SuggestRequest } from './request.ts'
import { handleBrainDump, handleTaskPriority } from './tasks.ts'
import { userTimeZone } from './time.ts'
import { handleWorkoutPlan, handleWorkoutProgramChat } from './workout.ts'

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let ledger: AiLedger | null = null
  try {
    // Auth token'dan kullanıcı ID'si al
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return json({ error: 'Unauthorized' }, 401)

    const body: SuggestRequest = await req.json()
    const { type, language, today: clientToday, task_id } = body

    // Pro, deneme ya da free kullanıcının ücretsiz gün planı hakkı; bütçe
    // aşımı da burada karara bağlanıyor (_shared/ai/usage.ts).
    const access = await resolveAiAccess(supabase, user.id, type)
    if (!access.allowed) return json({ error: access.error, code: access.code }, access.status)

    // Ölçüm burada, istemcide değil: web'de AI çağrısı beş ayrı bileşene
    // dağılmış durumda ve mobil ayrı bir yoldan geliyor. Her rota tek model
    // çağrısı yapıyor; satır o çağrıdan hemen sonra token ve USD maliyetiyle
    // yazılır. `supabase` kullanıcının JWT'siyle çalışıyor, RLS insert
    // politikasından geçiyor.
    // Ücretsiz katmanda rezervasyon satırını kapatmak için service role gerekir
    // (events kullanıcıya yalnızca INSERT açık; satırı kullanıcı güncelleyemez).
    const settleClient = access.tier === 'free'
      ? createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      : null
    ledger = new AiLedger(supabase, user.id, type, access.tier, settleClient)

    const lang: Lang = language === 'en' ? 'en' : 'tr'
    const langInstr = lang === 'en' ? 'Respond in English.' : 'Türkçe yanıt ver.'
    const today = isIsoDate(clientToday) ? clientToday : localDate(await userTimeZone(supabase, user.id))

    // Model seçimi, bütçe aşımında yedek modele geçiş ve maliyet kaydı katmanın
    // içinde (_shared/ai/llm). Yedek model çalıştıysa yanıta `ai_mode: 'fallback'` eklenir.
    const activeLedger = ledger
    const generate = bindRoute(getRouter(), type, {
      overBudget: access.overBudget,
      onResult: (result) => activeLedger.add(result),
    })
    const modeJson = (payload: unknown, status = 200) => json(withAiMode(payload, activeLedger.mode()), status)

    const route: RouteContext = {
      supabase, userId: user.id, body, generate, ledger, lang, langInstr, today, json: modeJson,
    }

    // `await` şart: rota içinde fırlayan hata aşağıdaki catch'e düşmeli.
    const dispatch = async (): Promise<Response> => {
      if (type === 'daily_plan') return await handleDailyPlan(route)
      if (type === 'brain_dump') return await handleBrainDump(route)
      if (type === 'task_priority' && task_id) return await handleTaskPriority(route, task_id)
      if (type === 'workout_plan') return await handleWorkoutPlan(route)
      if (type === 'workout_program_chat') return await handleWorkoutProgramChat(route)
      if (type === 'replan') return await handleReplan(route)
      if (type === 'nutrition_chat') return await handleNutritionChat(route)
      if (type === 'life_setup') return await handleLifeSetup(route)
      if (type === 'daily_report') return await handleDailyReport(route)
      return json({ error: 'Geçersiz istek tipi' }, 400)
    }
    const response = await dispatch()
    // Toplanan çağrılar tek `ai_used` satırı olarak şimdi yazılır.
    await activeLedger.flush()
    return response
  } catch (error) {
    // Model fırlattıysa ayrılmış ücretsiz hak yanmasın; harcanan maliyet yine yazılır.
    ledger?.markFailed()
    await ledger?.abandon()
    await ledger?.flush()
    console.error('ai-suggest error:', error)
    const message = error instanceof Error ? error.message : String(error)
    console.error('ai-suggest stack:', error instanceof Error ? error.stack : undefined)
    return new Response(
      JSON.stringify({ error: 'AI öneri oluşturulurken hata oluştu', detail: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
