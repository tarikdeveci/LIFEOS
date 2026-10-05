import { useCallback, useEffect, useMemo, useState } from 'react'
import { AccessibilityInfo } from 'react-native'
import { describeAiError, useReportStore, type DailyReport, type HabitWeek, type SkipReason } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { useLang } from '@/src/contexts/LangContext'
import { useProGate } from '@/src/hooks/useProGate'
import {
  closureItems, habitRows, postponedRows, programRows, summarize, viewItems, wentWellLines,
  type DaySummary, type PostponedRow, type ProgramRow, type ViewItem,
} from './reportModel'

/** Raporun bölümlere dağıtılmış hâli. */
export interface DayReportView {
  summary: DaySummary
  closure: ViewItem[]
  postponed: PostponedRow[]
  programs: ProgramRow[]
  habits: HabitWeek[]
  lines: string[]
}

export interface DayReport {
  /** 'loading': ilk yükleme, 'error': açılamadı ve eski hâl yok, 'ready': rapor ekranda. */
  status: 'loading' | 'error' | 'ready'
  report: DailyReport | null
  view: DayReportView | null
  /** Ekrandaki rapor önbellekten; tazeleme tutmadı. */
  stale: boolean
  loading: boolean
  refreshing: boolean
  saveFailed: boolean
  isPro: boolean
  isCheckingPro: boolean
  insightLoading: boolean
  insightError: string | null
  refresh: () => Promise<void>
  markDone: (key: string) => void
  undoDone: (key: string) => void
  mark: (key: string, outcome: 'partial' | 'skipped') => void
  toggleReason: (key: string, reason: SkipReason) => void
  askInsight: () => Promise<void>
}

/**
 * Gün raporu ekranının durumu: raporu açar (opened: true), kapanış dokunuşlarını store'a
 * yazar, AI yorumunu ister. Bölümler yalnızca buradan dönen görünümü çizer.
 */
export function useDayReport(date: string): DayReport {
  const { lang, t } = useLang()
  // undefined: oturum henüz okunmadı, null: oturum yok.
  const [userId, setUserId] = useState<string | null | undefined>(undefined)
  // Bu oturumda karar verilen işler: kart listeden kaybolmaz, karar değiştirilebilir.
  const [touched, setTouched] = useState<string[]>([])
  const [saveFailed, setSaveFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [insightError, setInsightError] = useState<string | null>(null)
  const { isPro, isCheckingPro, requirePro } = useProGate(userId)

  const owner = useReportStore((s) => s.userId)
  const cached = useReportStore((s) => s.reports[date])
  const loading = useReportStore((s) => s.loading[date] ?? false)
  const error = useReportStore((s) => s.errors[date] ?? null)
  const insightLoading = useReportStore((s) => s.insightLoading[date] ?? false)
  // Önbellek başka hesabınsa gösterilmez; fetchReport onu zaten boşaltır.
  const report = userId && owner === userId && cached ? cached : null

  const resolveUser = useCallback(async () => {
    const { data } = await supabase.auth.getUser()
    setUserId(data.user?.id ?? null)
  }, [])

  useEffect(() => { void resolveUser() }, [resolveUser])

  useEffect(() => {
    if (!userId) return
    void useReportStore.getState().fetchReport(supabase, userId, date, lang, { opened: true })
  }, [userId, date, lang])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      if (userId) await useReportStore.getState().fetchReport(supabase, userId, date, lang)
      else await resolveUser()
    } finally {
      setRefreshing(false)
    }
  }, [userId, date, lang, resolveUser])

  const items = useMemo(() => (report ? viewItems(report) : []), [report])
  const view = useMemo<DayReportView | null>(() => {
    if (!report) return null
    return {
      summary: summarize(items),
      closure: closureItems(items, touched),
      postponed: postponedRows(items, report.narrative),
      programs: programRows(items),
      habits: habitRows(report),
      lines: wentWellLines(items, report.narrative),
    }
  }, [report, items, touched])

  /** Yazma store'da iyimserdir: tutmazsa ekran geri döner, burada yalnızca haber verilir. */
  const save = async (key: string, job: () => Promise<void>) => {
    setTouched((keys) => (keys.includes(key) ? keys : [...keys, key]))
    setSaveFailed(false)
    try {
      await job()
    } catch (err) {
      console.warn('Gün raporu kaydedilemedi:', err)
      setSaveFailed(true)
      // Kart eski hâline döndü; ekran okuyucu kullanan bunu göremez, duyması gerekir.
      AccessibilityInfo.announceForAccessibility(t.report_save_error)
    }
  }

  const setDone = (key: string, done: boolean) => {
    if (!userId) return
    void save(key, () => useReportStore.getState().setItemDone(supabase, userId, date, lang, key, done))
  }

  const mark = (key: string, outcome: 'partial' | 'skipped') => {
    const item = items.find((i) => i.key === key)
    if (!item) return
    // Seçili işarete tekrar dokunmak onu kaldırır; yarım ile olmadı arasında geçişte neden korunur.
    const next = item.outcome === outcome ? null : { outcome, ...(item.reason ? { reason: item.reason } : {}) }
    void save(key, () => useReportStore.getState().setItemMark(supabase, date, lang, key, next))
  }

  const toggleReason = (key: string, reason: SkipReason) => {
    const item = items.find((i) => i.key === key)
    if (!item || (item.outcome !== 'partial' && item.outcome !== 'skipped')) return
    const next = { outcome: item.outcome, ...(item.reason === reason ? {} : { reason }) }
    void save(key, () => useReportStore.getState().setItemMark(supabase, date, lang, key, next))
  }

  const askInsight = async () => {
    if (!requirePro('daily_report')) return
    setInsightError(null)
    try {
      await useReportStore.getState().requestInsight(supabase, date, lang)
    } catch (err) {
      const info = await describeAiError(err, lang)
      console.warn('Gün raporu AI yorumu alınamadı:', info.kind, info.detail)
      setInsightError(info.message)
    }
  }

  const failed = userId === null || (error !== null && !loading)
  return {
    status: report ? 'ready' : failed ? 'error' : 'loading',
    report,
    view,
    stale: report !== null && error !== null && !loading,
    loading,
    refreshing,
    saveFailed,
    isPro,
    isCheckingPro,
    insightLoading,
    insightError,
    refresh,
    markDone: (key) => setDone(key, true),
    undoDone: (key) => setDone(key, false),
    mark,
    toggleReason,
    askInsight,
  }
}
