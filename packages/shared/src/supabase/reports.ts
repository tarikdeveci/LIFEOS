// Gün raporu: daily-report edge function'ı ve ai-suggest'in daily_report rotası.
// Olgular sunucuda hesaplanır (supabase/functions/_shared/report); burası yalnızca çağırır.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DailyReport, DayCheckin, DayNarrative } from '../types/report'
import { todayDate } from '../utils/date'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any>

export type ReportLanguage = 'tr' | 'en'

export interface FetchDailyReportOptions {
  /** Kapanış işaretlerinin TAMAMI: sunucu saklananın yerine bunu yazar (geri alma da böyle gider). */
  checkin?: DayCheckin
  /** Rapor ekranı açıldı; sunucu opened_at'i bir kez doldurur. */
  opened?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Günün raporunu hesaplatır ve satırı döner. `facts` ham olgulardır: yarım ve olmadı
 * işaretleri `checkin` içinde ayrı durur, öğelere ekran tarafında işlenir.
 */
export async function fetchDailyReport(
  supabase: Supabase,
  date: string,
  language: ReportLanguage,
  opts: FetchDailyReportOptions = {},
): Promise<DailyReport> {
  const { data, error } = await supabase.functions.invoke('daily-report', {
    body: {
      date,
      language,
      ...(opts.checkin ? { checkin: opts.checkin } : {}),
      ...(opts.opened ? { opened: true } : {}),
    },
  })

  if (error) throw error
  const report = isRecord(data) ? data['report'] : null
  const facts = isRecord(report) ? report['facts'] : null
  if (!isRecord(report) || !isRecord(facts) || !Array.isArray(facts['items'])) {
    throw new Error('daily-report: beklenmeyen yanıt')
  }
  return report as unknown as DailyReport
}

/**
 * Raporun AI yorumu (yalnızca Pro). Rapor başına tek çağrı: sunucu anlatıyı saklar,
 * sonraki fetchDailyReport aynı anlatıyı döner. 402/429 hataları olduğu gibi fırlatılır;
 * çağıran describeAiError ile sınıflandırır.
 */
export async function requestReportInsight(
  supabase: Supabase,
  date: string,
  language: ReportLanguage,
): Promise<DayNarrative> {
  const { data, error } = await supabase.functions.invoke('ai-suggest', {
    // today: sunucu UTC'de çalışır, yerel gün her AI çağrısında gönderilir.
    body: { type: 'daily_report', date, language, today: todayDate() },
  })

  if (error) throw error
  const narrative = isRecord(data) ? data['narrative'] : null
  if (
    !isRecord(narrative) ||
    typeof narrative['headline'] !== 'string' ||
    !Array.isArray(narrative['went_well']) ||
    !Array.isArray(narrative['postponed'])
  ) {
    throw new Error('ai-suggest: anlatı gelmedi')
  }
  return narrative as unknown as DayNarrative
}
