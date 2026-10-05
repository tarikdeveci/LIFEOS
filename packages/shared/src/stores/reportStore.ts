import { create } from 'zustand'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DailyReport, DayCheckin, DayItem, SkipReason } from '../types/report'
import { fetchDailyReport, requestReportInsight, type ReportLanguage } from '../supabase/reports'
import { updateTimeBlock } from '../supabase/planning'
import { getRoutines, setHabitCount as writeHabitCount } from '../supabase/routines'
import { todayDate } from '../utils/date'
import { mondayOf } from '../utils/routine'
import { usePlanningStore } from './planningStore'
import { useRoutineStore } from './routineStore'
import { useTaskStore } from './taskStore'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any>

/** Kapanış işareti: "yaptım" burada yoktur, o gerçek tamamlamadır. */
export interface CheckinMark {
  outcome: 'partial' | 'skipped'
  reason?: SkipReason
}

interface ReportState {
  /** Önbelleğin sahibi; başka kullanıcı girince önbellek boşalır. */
  userId: string | null
  /** Tarihe göre önbellek: ekran yeniden açılınca önce bu görünür, arkada tazelenir. */
  reports: Record<string, DailyReport>
  loading: Record<string, boolean>
  errors: Record<string, string | null>
  insightLoading: Record<string, boolean>

  // Actions
  fetchReport: (
    supabase: Supabase,
    userId: string,
    date: string,
    language: ReportLanguage,
    opts?: { opened?: boolean },
  ) => Promise<void>
  /** Yarım / olmadı işareti (null işareti kaldırır). İyimser: önce ekran, hata olursa geri alınır. */
  setItemMark: (
    supabase: Supabase,
    date: string,
    language: ReportLanguage,
    key: string,
    mark: CheckinMark | null,
  ) => Promise<void>
  /** "Yaptım": gerçek tamamlamayı yazar, sonra raporu tazeler. done=false geri alır. */
  setItemDone: (
    supabase: Supabase,
    userId: string,
    date: string,
    language: ReportLanguage,
    key: string,
    done: boolean,
  ) => Promise<void>
  /** AI yorumu (Pro): gelen anlatı şablonun yerini alır. Hata çağırana fırlatılır. */
  requestInsight: (supabase: Supabase, date: string, language: ReportLanguage) => Promise<void>
}

/** Sunucudan gelen son hâl; iyimser yazma tutmazsa buraya dönülür. */
const confirmed = new Map<string, DailyReport>()
/** Güne göre yazma sürümü ve kuyruğu: yazmalar sırayla gider, yalnız en yenisinin yanıtı ekrana işlenir. */
const versions = new Map<string, number>()
const queues = new Map<string, Promise<unknown>>()
/** Güne göre okuma sırası: dil değişince ya da çift açılışta eski okumanın yanıtı yenisini ezmesin. */
const reads = new Map<string, number>()
/** "Yaptım"dan önceki alışkanlık sayacı: geri alınca günde N kez sayacı sıfıra düşmesin. */
const habitBefore = new Map<string, number>()

const isLatest = (date: string, version: number) => (versions.get(date) ?? 0) === version

function enqueue<T>(date: string, job: () => Promise<T>): Promise<T> {
  const run = (queues.get(date) ?? Promise.resolve()).catch(() => undefined).then(job)
  queues.set(date, run)
  const clear = () => { if (queues.get(date) === run) queues.delete(date) }
  void run.then(clear, clear)
  return run
}

/** Öğenin sonucunu ekranda hemen değiştirir; program sayacı da bir adım oynar (sunucu yanıtı düzeltir). */
function withOutcome(report: DailyReport, key: string, done: boolean, checkin: DayCheckin): DailyReport {
  const items = report.facts.items.map((item): DayItem => {
    if (item.key !== key) return item
    const program = item.program
      ? { ...item.program, done: Math.min(Math.max(item.program.done + (done ? 1 : -1), 0), item.program.target) }
      : null
    return { ...item, outcome: done ? 'done' : 'open', reason: null, program }
  })
  return { ...report, checkin, facts: { ...report.facts, items } }
}

/** Şablon anlatıdaki eski notu düşürür: işaret değişince sunucunun yeni notu gelene kadar bayat cümle görünmesin. */
function withoutNote(report: DailyReport, title: string): DailyReport {
  const narrative = report.narrative
  if (!narrative || narrative.source !== 'template') return report
  return { ...report, narrative: { ...narrative, postponed: narrative.postponed.filter((p) => p.title !== title) } }
}

/** "Yaptım"ın gerçek yazımı: görev done, blok completed_at, alışkanlık işareti. */
async function writeCompletion(
  supabase: Supabase,
  userId: string,
  date: string,
  item: DayItem,
  done: boolean,
): Promise<void> {
  const id = item.key.slice(item.key.indexOf(':') + 1)

  if (item.kind === 'task') {
    await useTaskStore.getState().setStatus(supabase, id, done ? 'done' : 'planned')
    return
  }

  if (item.kind === 'block') {
    const planning = usePlanningStore.getState()
    if (planning.timeBlocks.some((b) => b.id === id)) {
      await planning.setBlockDone(supabase, id, done)
      return
    }
    // Blok planlama store'unda yok (başka gün ya da ekran hiç açılmadı): doğrudan yazılır,
    // bağlı görev varsa setBlockDone ile aynı kuralla o da kapanır.
    const block = await updateTimeBlock(supabase, id, { completed_at: done ? new Date().toISOString() : null })
    if (block.task_id) await useTaskStore.getState().setStatus(supabase, block.task_id, done ? 'done' : 'planned')
    return
  }

  const routines = useRoutineStore.getState()
  const memo = `${date}|${id}`
  let count = 0
  if (done) {
    const routine = routines.routines.find((r) => r.id === id)
      ?? (await getRoutines(supabase, userId)).find((r) => r.id === id)
    habitBefore.set(memo, routines.completions.find((c) => c.routine_id === id && c.completed_on === date)?.count ?? 0)
    count = routine?.times_per_day ?? 1
  } else {
    count = habitBefore.get(memo) ?? 0
    habitBefore.delete(memo)
  }
  // Store yalnız içinde bulunulan haftanın işaretlerini tutar; eski günün işareti ona karışmaz.
  if (date >= mondayOf(todayDate())) await routines.setHabitCount(supabase, userId, id, date, count)
  else await writeHabitCount(supabase, userId, id, date, count)
}

export const useReportStore = create<ReportState>((set, get) => {
  const put = (date: string, report: DailyReport) =>
    set((state) => ({ reports: { ...state.reports, [date]: report } }))

  /**
   * İyimser yazma: önce ekran, sonra sunucu. Yanıt yalnız hâlâ en yeni yazmaysa ekrana işlenir;
   * en yeni yazma tutmazsa son doğrulanmış hâle dönülür. İş null dönerse (yazıldı ama rapor
   * tazelenemedi) ekrandaki hâl doğru kabul edilir.
   */
  const commit = async (date: string, optimistic: DailyReport, job: () => Promise<DailyReport | null>) => {
    const version = (versions.get(date) ?? 0) + 1
    versions.set(date, version)
    put(date, optimistic)
    try {
      const fresh = await enqueue(date, job)
      confirmed.set(date, fresh ?? optimistic)
      if (fresh && isLatest(date, version)) put(date, fresh)
    } catch (err) {
      const last = confirmed.get(date)
      if (last && isLatest(date, version)) put(date, last)
      throw err
    }
  }

  return {
    userId: null,
    reports: {},
    loading: {},
    errors: {},
    insightLoading: {},

    fetchReport: async (supabase, userId, date, language, opts) => {
      if (get().userId !== userId) {
        // Aynı cihazda hesap değişti: önceki kullanıcının raporu bellekte kalmasın.
        confirmed.clear()
        versions.clear()
        reads.clear()
        habitBefore.clear()
        set({ userId, reports: {}, loading: {}, errors: {}, insightLoading: {} })
      }
      const version = versions.get(date) ?? 0
      const read = (reads.get(date) ?? 0) + 1
      reads.set(date, read)
      const superseded = () => get().userId !== userId || reads.get(date) !== read
      set((state) => ({ loading: { ...state.loading, [date]: true }, errors: { ...state.errors, [date]: null } }))
      try {
        const report = await fetchDailyReport(supabase, date, language, opts?.opened ? { opened: true } : {})
        if (superseded()) return
        // Bu arada iyimser bir yazma başladıysa onun yanıtı daha yenidir; eski okuma ekranı ezmesin.
        if (isLatest(date, version)) {
          confirmed.set(date, report)
          put(date, report)
        }
        set((state) => ({ loading: { ...state.loading, [date]: false } }))
      } catch (err) {
        if (superseded()) return
        set((state) => ({
          loading: { ...state.loading, [date]: false },
          errors: { ...state.errors, [date]: err instanceof Error ? err.message : 'Hata' },
        }))
      }
    },

    setItemMark: async (supabase, date, language, key, mark) => {
      const current = get().reports[date]
      const item = current?.facts.items.find((i) => i.key === key)
      if (!current || !item) return
      const marks = { ...(current.checkin.items ?? {}) }
      if (mark) marks[key] = mark
      else delete marks[key]
      const checkin: DayCheckin = { ...current.checkin, items: marks }
      await commit(date, withoutNote({ ...current, checkin }, item.title), () =>
        fetchDailyReport(supabase, date, language, { checkin }),
      )
    },

    setItemDone: async (supabase, userId, date, language, key, done) => {
      const current = get().reports[date]
      const item = current?.facts.items.find((i) => i.key === key)
      if (!current || !item || (item.outcome === 'done') === done) return
      const marks = { ...(current.checkin.items ?? {}) }
      delete marks[key]
      const checkin: DayCheckin = { ...current.checkin, items: marks }
      await commit(date, withoutNote(withOutcome(current, key, done, checkin), item.title), async () => {
        await writeCompletion(supabase, userId, date, item, done)
        // Tamamlama yazıldı: rapor tazelenemese de işlem tutmuştur, ekran geri alınmaz.
        return fetchDailyReport(supabase, date, language, { checkin }).catch(() => null)
      })
    },

    requestInsight: async (supabase, date, language) => {
      if (get().insightLoading[date]) return
      set((state) => ({ insightLoading: { ...state.insightLoading, [date]: true } }))
      try {
        const narrative = await requestReportInsight(supabase, date, language)
        const last = confirmed.get(date)
        if (last) confirmed.set(date, { ...last, narrative })
        const shown = get().reports[date]
        if (shown) put(date, { ...shown, narrative })
      } finally {
        set((state) => ({ insightLoading: { ...state.insightLoading, [date]: false } }))
      }
    },
  }
})
