import { AccessibilityInfo } from 'react-native'
import { useDayReport as useSharedDayReport, type DayReportState } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { useLang } from '@/src/contexts/LangContext'
import { useProGate } from '@/src/hooks/useProGate'

export type { DayReportView } from '@lifeos/shared'

export interface DayReport extends DayReportState {
  isPro: boolean
  isCheckingPro: boolean
}

/** Gün raporu ekranının durumu: ortak hook ve mobilin Pro kapısı ile ekran okuyucu duyurusu. */
export function useDayReport(date: string): DayReport {
  const { lang, t } = useLang()
  const { isPro, isCheckingPro, requirePro } = useProGate()
  const day = useSharedDayReport({
    supabase, date, lang,
    requirePro: () => requirePro('daily_report'),
    // Kart eski hâline döndü; ekran okuyucu kullanan bunu göremez, duyması gerekir.
    onSaveError: () => AccessibilityInfo.announceForAccessibility(t.report_save_error),
  })
  return { ...day, isPro, isCheckingPro }
}
