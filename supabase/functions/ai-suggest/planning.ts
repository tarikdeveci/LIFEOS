// supabase/functions/ai-suggest/planning.ts
// Gün planı rotaları: daily_plan (öneri listesi) ve replan (planlama koçu sohbeti).

import { buildPlannerPrompt, parsePlannerResult, type PlannerTask } from '../_shared/ai/coach.ts'
import { CHAT_EFFORT, LEGACY_MODEL, firstText } from './model.ts'
import { normalizeHistory, type RouteContext } from './request.ts'
import { busyBlocks } from './time.ts'

export async function handleDailyPlan(route: RouteContext): Promise<Response> {
  const { supabase, userId, client, ledger, langInstr, today, json } = route
  const { date, existing_blocks, buffer_minutes } = route.body

  // Günlük plan önerileri
  const targetDate = date ?? today

  // Bugüne atanmış görevleri al
  const { data: tasks } = await supabase
    .from('tasks')
    .select('title, status, value_score, urgency_score, risk_score, effort_score, friction_score, priority_score, estimated_minutes, tags')
    .eq('scheduled_date', targetDate)
    .not('status', 'in', '(done,deferred)')
    .order('priority_score', { ascending: false })

  // Dünden taşan görevler
  const { data: carryover } = await supabase
    .from('tasks')
    .select('title, priority_score, scheduled_date')
    .lt('scheduled_date', targetDate)
    .not('status', 'in', '(done,deferred)')
    .order('priority_score', { ascending: false })
    .limit(5)

  // Enerji seviyesi
  const { data: plan } = await supabase
    .from('daily_plans')
    .select('energy_level')
    .eq('date', targetDate)
    .single()

  const taskSummary =
    tasks
      ?.map(
        (t) =>
          `- ${t.title} (öncelik: ${t.priority_score}, efor: ${t.effort_score}, süre: ${t.estimated_minutes ?? '?'}dk)`,
      )
      .join('\n') ?? 'Görev yok'

  const carryoverSummary =
    carryover?.length
      ? carryover.map((t) => `- ${t.title} (${t.scheduled_date}'den taşıyor)`).join('\n')
      : 'Taşan görev yok'

  const withBusy = [...(existing_blocks ?? []), ...(await busyBlocks(supabase, userId, targetDate))]
  const existingBlocksSummary = withBusy.length
    ? withBusy.map((b) => `  ${b.start}–${b.end}: ${b.label}`).join('\n')
    : '  (Blok yok)'
  const bufferNote = buffer_minutes && buffer_minutes > 0 ? `Görevler arasına ${buffer_minutes} dakika buffer ekle.` : ''

  const response = await client.messages.create({
    model: LEGACY_MODEL,
    // Sonnet 5'te dusunme varsayilan olarak acik ve ayni max_tokens
    // butcesini paylasiyor. Bu rota JSON dondurmek zorunda; butce
    // dusunmeye giderse cikti yarim kalir ve ayrıştırma patlar.
    thinking: { type: 'disabled' as const },
    max_tokens: 1500,
    system: `Sen LifeOS kişisel yaşam asistanısın. Kullanıcının günlük planlamasına yardımcı oluyorsun.
${langInstr} Kısa ve net öneriler sun. Emoji kullan.
Yanıtını SADECE şu JSON formatında ver:
[{"type": "task_order"|"break"|"focus_block"|"general", "message": "öneri metni", "task_id": "varsa ilgili task ID", "suggested_start": "HH:MM veya null", "suggested_end": "HH:MM veya null", "block_type": "task"|"break"|"focus"|"routine"|"meal"|"workout" veya null}]
Mola ve odak blokları için mutlaka suggested_start ve suggested_end ver. Görev sıralaması için null bırak.`,
    messages: [
      {
        role: 'user',
        content: `Bugünün planı için öneriler ver.

Enerji seviyesi: ${plan?.energy_level ?? 'belirtilmemiş'}/5
${bufferNote}

Mevcut zaman blokları:
${existingBlocksSummary}

Bugünün görevleri:
${taskSummary}

Dünden taşan görevler:
${carryoverSummary}

Lütfen şunları öner:
1. Görev sıralaması
2. Mola zamanları (kesin saat ver: ör. 10:30–11:00)
3. Odak blokları (kesin saat ver: ör. 14:00–16:00)
4. Genel öneri

Mevcut bloklara çakışma olmasın. Çalışma saatleri 08:00–22:00.`,
      },
    ],
  })
  await ledger.record(response)

  const text = firstText(response)
  let suggestions: unknown[] = []
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (jsonMatch) suggestions = JSON.parse(jsonMatch[0])
  } catch {
    suggestions = [{ type: 'general', message: text }]
  }

  return json({ suggestions })
}

export async function handleReplan(route: RouteContext): Promise<Response> {
  const { supabase, userId, body, client, chatModel, ledger, lang, today, json } = route
  const { date, energy_level, buffer_minutes, existing_blocks, user_message, current_time } = body

  const targetDate = date ?? today
  const now = current_time ?? new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false })
  const planningCutoff = targetDate === today ? now : '00:00'

  const { data: scheduledRows } = await supabase
    .from('tasks')
    .select('id, title, estimated_minutes, priority_score, scheduled_date')
    .eq('user_id', userId)
    .eq('scheduled_date', targetDate)
    .not('status', 'in', '(done,deferred)')
    .order('priority_score', { ascending: false })
    .limit(20)

  // Bekleyen görevler: koç boşluk gördüğünde buradan çekebilsin diye.
  // Eskiden yalnızca güne atanmış görevler veriliyordu ve "günümü doldur"
  // isteğinde ekleyecek bir şey bulamıyordu.
  const { data: backlogRows } = await supabase
    .from('tasks')
    .select('id, title, estimated_minutes, priority_score, scheduled_date')
    .eq('user_id', userId)
    .is('scheduled_date', null)
    .not('status', 'in', '(done,deferred)')
    .order('priority_score', { ascending: false })
    .limit(10)

  const toPlannerTask = (row: Record<string, unknown>): PlannerTask => ({
    id: row['id'] as string,
    title: row['title'] as string,
    estimated_minutes: (row['estimated_minutes'] as number | null) ?? null,
    priority_score: (row['priority_score'] as number | null) ?? null,
    scheduled_date: (row['scheduled_date'] as string | null) ?? null,
  })

  const { data: planRow } = await supabase
    .from('daily_plans')
    .select('energy_level')
    .eq('user_id', userId)
    .eq('date', targetDate)
    .maybeSingle()

  const blocks = [...(existing_blocks ?? []), ...(await busyBlocks(supabase, userId, targetDate))]
  const { system, messages } = buildPlannerPrompt({
    lang,
    targetDate,
    today,
    now,
    planningCutoff,
    energyLevel: (planRow?.energy_level as number | null) ?? energy_level ?? null,
    bufferMinutes: buffer_minutes ?? 15,
    pastBlocks: blocks.filter((b) => b.end <= planningCutoff),
    futureBlocks: blocks.filter((b) => b.end > planningCutoff),
    scheduledTasks: (scheduledRows ?? []).map(toPlannerTask),
    backlogTasks: (backlogRows ?? []).map(toPlannerTask),
    history: normalizeHistory(body.history),
    userMessage: user_message?.trim() || 'Günümü planla',
  })

  const response = await client.messages.create({
    model: chatModel,
    output_config: CHAT_EFFORT,
    // Dusunme (effort low) ayni butceyi paylasiyor: eski deger dusunme
    // yokken olculmustu, simdi ciktinin yarim kalmamasi icin pay birakiyoruz.
    max_tokens: 7500,
    system,
    messages,
  })
  await ledger.record(response)

  const knownIds = new Set(blocks.flatMap((b) => (b.id ? [b.id] : [])))
  return json(parsePlannerResult(firstText(response), knownIds))
}
