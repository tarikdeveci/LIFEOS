// supabase/functions/ai-suggest/tasks.ts
// Görev rotaları: brain_dump (serbest metinden görev listesi) ve task_priority (WSJF skoru önerisi).

import { LEGACY_MODEL, firstText } from './model.ts'
import type { RouteContext } from './request.ts'

export async function handleBrainDump(route: RouteContext): Promise<Response> {
  const { client, chatModel, ledger, langInstr, today, json } = route
  const { user_message } = route.body

  // Sesle ya da elle dökülen serbest metin → temiz görev listesi. İstemci dönen
  // listeyi sanitizeBrainDumpItems ile yeniden doğrular ve onay ekranında gösterir.
  const text = typeof user_message === 'string' ? user_message.trim().slice(0, 4000) : ''
  if (!text) return json({ error: 'Metin boş' }, 400)

  const response = await client.messages.create({
    model: chatModel,
    thinking: { type: 'disabled' as const },
    max_tokens: 2048,
    system: `Kullanıcı aklındaki işleri dağınık, konuşma diliyle döktü. Bunu yapılacak görevlere çevir.
Bugün: ${today} (YYYY-MM-DD). Göreli tarihleri ("yarın", "cuma", "haftaya") bu güne göre çöz.
Kurallar:
- Her görev kısa, eylemle başlayan bir başlık olsun; tekrarları birleştir, görev olmayan cümleleri at.
- Sadece metinde geçen bilgiyi kullan; tarih, saat ya da süre uydurma.
- En fazla 30 görev.
${langInstr}
Sadece JSON döndür:
{"tasks":[{"title":"...","scheduled_date":"YYYY-MM-DD veya yok","due_date":"YYYY-MM-DD veya yok","start_time":"HH:MM veya yok","estimated_minutes":N veya yok,"tags":["..."]}]}
Bilinmeyen alanı hiç yazma.`,
    messages: [{ role: 'user', content: text }],
  })
  await ledger.record(response)

  let tasks: unknown = []
  try {
    const jsonMatch = firstText(response).match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('no json')
    tasks = (JSON.parse(jsonMatch[0]) as { tasks?: unknown }).tasks ?? []
  } catch {
    return json({ error: 'AI yanıtı çözümlenemedi' }, 502)
  }
  return json({ tasks: Array.isArray(tasks) ? tasks.slice(0, 30) : [] })
}

export async function handleTaskPriority(route: RouteContext, taskId: string): Promise<Response> {
  const { supabase, client, ledger, lang, json } = route

  // Tek görev için WSJF skoru önerisi
  const { data: task } = await supabase
    .from('tasks')
    .select('title, description, tags, due_date')
    .eq('id', taskId)
    .single()

  if (!task) return json({ error: 'Görev bulunamadı' }, 404)

  const response = await client.messages.create({
    model: LEGACY_MODEL,
    // Sonnet 5'te dusunme varsayilan olarak acik ve ayni max_tokens
    // butcesini paylasiyor. Bu rota JSON dondurmek zorunda; butce
    // dusunmeye giderse cikti yarim kalir ve ayrıştırma patlar.
    thinking: { type: 'disabled' as const },
    max_tokens: 512,
    system: `Sen bir görev önceliklendirme asistanısın. WSJF (Weighted Shortest Job First) metodunu kullanıyorsun.
Parametreler (1-5 arası):
- value_score: İş/kullanıcı değeri
- urgency_score: Zaman hassasiyeti
- risk_score: Risk azaltma / fırsat
- effort_score: Tahmini efor
- friction_score: Yapılmasının önündeki engel

Sadece JSON döndür:
{"value_score": N, "urgency_score": N, "risk_score": N, "effort_score": N, "friction_score": N, "reasoning": "${lang === 'en' ? 'Short explanation' : 'Kısa açıklama'}"}`,
    messages: [
      {
        role: 'user',
        content: `Bu görev için WSJF skorları öner:
Başlık: ${task.title}
Açıklama: ${task.description ?? 'Yok'}
Etiketler: ${task.tags?.join(', ') ?? 'Yok'}
Son tarih: ${task.due_date ?? 'Yok'}`,
      },
    ],
  })
  await ledger.record(response)

  const text = firstText(response)
  let suggestion: unknown = {}
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) suggestion = JSON.parse(jsonMatch[0])
  } catch {
    suggestion = { reasoning: text }
  }

  return json({ suggestion })
}
