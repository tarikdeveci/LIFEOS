import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DailyReport, HabitWeek, SkipReason } from '../types/report'
import { REPORT_NOT_FOUND, useReportStore } from '../stores/reportStore'
import { describeAiError } from '../utils/aiError'
import {
  closureItems, habitRows, postponedRows, programRows, summarize, viewItems, wentWellLines,
  type DaySummary, type PostponedRow, type ProgramRow, type ViewItem,
} from '../utils/dayReport'

/** Raporun bölümlere dağıtılmış hâli. */
export interface DayReportView {
  summary: DaySummary
  closure: ViewItem[]
  postponed: PostponedRow[]
  programs: ProgramRow[]
  habits: HabitWeek[]
  lines: string[]
}

export interface DayReportState {
  /** 'loading': ilk yükleme, 'error': açılamadı ve eski hâl yok, 'ready': rapor ekranda. */
  status: 'loading' | 'error' | 'ready'
  report: DailyReport | null
  view: DayReportView | null
  /** Ekrandaki rapor önbellekten; tazeleme tutmadı. */
  stale: boolean
  /** Sunucu bu gün için rapor satırı bulamadı (geçmiş gün, kayıt yok). */
  notFound: boolean
  loading: boolean
  refreshing: boolean
  saveFailed: boolean
  insightLoading: boolean
  insightError: string | null
  refresh: () => Promise<void>
  markDone: (key: string) => void
  undoDone: (key: string) => void
  mark: (key: string, outcome: 'partial' | 'skipped') => void
  toggleReason: (key: string, reason: SkipReason) => void
  askInsight: () => Promise<void>
}

export interface DayReportDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>
  date: string
  lang: 'tr' | 'en'
  /** Pro değilse platformun yönlendirmesini açar ve false döner. */
  requirePro: () => boolean
  /** Kapanış yazması tutmadı (ekran okuyucuya duyurmak gibi platform işleri için). */
  onSaveError?: () => void
}

/**
 * Gün raporu ekranının durumu: raporu açar (opened: true), kapanış dokunuşlarını store'a
 * yazar, AI yorumunu ister. Web ve mobil bölümleri yalnızca buradan dönen görünümü çizer.
 */
export function useDayReport({ supabase, date, lang, requirePro, onSaveError }: DayReportDeps): DayReportState {
  // undefined: oturum henüz okunmadı, null: oturum yok.
  const [userId, setUserId] = useState<string | null | undefined>(undefined)
  // Bu oturumda karar verilen işler: kart listeden kaybolmaz, karar değiştirilebilir.
  const [touched, setTouched] = useState<string[]>([])
  const [saveFailed, setSaveFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [insightError, setInsightError] = useState<string | null>(null)

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
  }, [supabase])

  useEffect(() => { void resolveUser() }, [resolveUser])

  useEffect(() => {
    if (!userId) return
    void useReportStore.getState().fetchReport(supabase, userId, date, lang, { opened: true })
  }, [supabase, userId, date, lang])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      if (userId) await useReportStore.getState().fetchReport(supabase, userId, date, lang)
      else await resolveUser()
    } finally {
      setRefreshing(false)
    }
  }, [supabase, userId, date, lang, resolveUser])

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
      onSaveError?.()
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
    if (!requirePro()) return
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
    notFound: report === null && error === REPORT_NOT_FOUND && !loading,
    stale: report !== null && error !== null && !loading,
    loading,
    refreshing,
    saveFailed,
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
