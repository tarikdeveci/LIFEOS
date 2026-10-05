// Akşam slotunun rapor yolu (notification_preferences.report_enabled = true).
// Cron'da AI çağrısı yok: olgular hesaplanır, daily_reports'a yazılır, bildirim yollanır.
// Var olan kapanış (checkin) ve AI anlatısı ezilmez (_shared/report/store.ts).

import type { Db } from '../_shared/report/facts.ts'
import { applyCheckin, summarizeDay } from '../_shared/report/narrative.ts'
import { refreshReport } from '../_shared/report/store.ts'
import { serviceProgress } from '../_shared/report/userData.ts'
import type { Copy, DayContext } from './copy.ts'
import { eveningReportCopy } from './reportCopy.ts'

export interface EveningReport {
  copy: Copy
  /** Bildirimin data.report_date alanı: yeni istemci /report?date= açar. */
  reportDate: string
}

/** Hata fırlatır: çağıran eski akşam özetine düşer. */
export async function buildEveningReport(
  db: Db,
  userId: string,
  date: string,
  timezone: string,
  ctx: DayContext,
): Promise<EveningReport> {
  const report = await refreshReport(db, {
    userId,
    date,
    today: date,
    timezone,
    // Cron kullanıcının dilini bilmiyor (bildirim metinleri Türkçe). Uygulama raporu açınca
    // şablon anlatı istemcinin diliyle yeniden üretilir.
    language: 'tr',
    progress: await serviceProgress(db, userId),
  })
  const summary = summarizeDay(applyCheckin(report.facts, report.checkin))
  return { copy: eveningReportCopy(summary, ctx), reportDate: date }
}
