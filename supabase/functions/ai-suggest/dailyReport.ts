// supabase/functions/ai-suggest/dailyReport.ts
// daily_report rotası: gün raporunun AI anlatısı. Rapor başına en çok bir model
// çağrısı: anlatı `source: 'ai'` ile satıra yazılır, sonraki istekler saklananı döner.
// Olgular (facts) ve kapanış işaretleri (checkin) `daily-report` fonksiyonundan gelir,
// bu rota onları yalnızca okur.

import {
  buildDailyReportPrompt,
  isCalendarDate,
  parseDailyReportNarrative,
  readReportContext,
  readStoredAiNarrative,
} from '../_shared/ai/dailyReport.ts'
import { CHAT_EFFORT, firstText } from './model.ts'
import { loadPlanningRules } from './planningContext.ts'
import type { RouteContext } from './request.ts'

export async function handleDailyReport(route: RouteContext): Promise<Response> {
  const { supabase, userId, body, client, chatModel, ledger, lang, json } = route

  const date = body.date
  if (!isCalendarDate(date)) return json({ error: 'Geçersiz tarih', code: 'invalid_date' }, 400)

  const { data: row, error } = await supabase
    .from('daily_reports')
    .select('facts, checkin, narrative')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle()
  if (error) throw new Error(`daily_reports okunamadı: ${error.message}`)
  if (!row) return json({ error: 'Rapor bulunamadı', code: 'report_not_found' }, 404)

  // Yeniden çağrı model harcamasın: saklanan AI anlatısı olduğu gibi döner.
  const stored = readStoredAiNarrative(row.narrative)
  if (stored) return json({ narrative: stored })

  const context = readReportContext(row.facts, row.checkin)
  if (!context) return json({ error: 'Rapor bulunamadı', code: 'report_not_found' }, 404)

  const rules = await loadPlanningRules(supabase, userId)
  const { system, messages } = buildDailyReportPrompt({ lang, context, about: rules.about ?? '' })

  const response = await client.messages.create({
    model: chatModel,
    output_config: CHAT_EFFORT,
    // Dusunme (effort low) ayni butceyi paylasiyor; cikti kisa ama yarim kalmamali.
    max_tokens: 3000,
    system,
    messages,
  })
  await ledger.record(response)

  const narrative = parseDailyReportNarrative(firstText(response), context.items)
  if (!narrative) return json({ error: 'AI yanıtı çözümlenemedi' }, 502)

  // Yazılamazsa anlatı yine de döner: model parası harcandı. Kayıt olmadığı için bir
  // sonraki açılışta yeniden üretilir, bu yüzden hata sessiz geçilmez.
  const { error: writeError } = await supabase
    .from('daily_reports')
    .update({ narrative })
    .eq('user_id', userId)
    .eq('date', date)
  if (writeError) console.error('daily_reports anlatısı yazılamadı:', writeError.message)

  return json({ narrative })
}
