// Gün raporunun ekran modeli: sunucudan gelen satırı bölümlerin çizdiği biçime çevirir.
// Saf fonksiyonlar. Olgu hesaplanmaz; yalnızca kapanış işaretleri öğelere işlenir ve sayılır.
// Web ve mobil aynı modeli kullanır.
import type { DailyReport, DayItem, DayNarrative, HabitWeek, SkipReason } from '../types/report'
import { daysBetween, fromDateString, toDateString } from './date'

/** Rapor en fazla bu kadar gün geriye açılır; sunucu da eski günlerde satır üretmez. */
export const REPORT_MAX_DAYS_BACK = 30

/** Geçerli bir takvim günü, gelecek değil, 30 günden eski değil; aksi hâlde bugün. */
export function resolveReportDate(raw: unknown, today: string): string {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return today
  if (toDateString(fromDateString(raw)) !== raw) return today
  const back = daysBetween(raw, today)
  return back < 0 || back > REPORT_MAX_DAYS_BACK ? today : raw
}

export type RingTone = 'done' | 'partial' | 'rest'

export interface ViewItem extends DayItem {
  /** Manevi ya da sayaçsız iş: sayıya, yüzdeye, başarı diline girmez. */
  quiet: boolean
}

export interface DaySummary {
  total: number
  done: number
  partial: number
  skipped: number
  open: number
  /** Halkanın dilimleri, günün sırasıyla. */
  tones: RingTone[]
}

export interface PostponedRow {
  key: string
  title: string
  outcome: 'partial' | 'skipped'
  reason: SkipReason | null
  note: string | null
}

export interface ProgramRow {
  title: string
  done: number
  target: number
  /** Bugünkü oturum yapıldı: çubuk bir adım ilerler. */
  advanced: boolean
}

/** Bu sayıdan fazla iş varsa halka tek tek dilim yerine oranları gösterir. */
const MAX_SEGMENTS = 24

/**
 * `facts` ham gelir (yalnız done ve open). Yarım ve olmadı işaretleri sunucudaki
 * applyCheckin ile aynı kuralla burada işlenir: gerçek tamamlama işaretin önüne geçer.
 */
export function viewItems(report: DailyReport): ViewItem[] {
  const marks = report.checkin.items ?? {}
  return report.facts.items.map((item) => {
    const mark = item.outcome === 'open' ? marks[item.key] : undefined
    return {
      ...item,
      outcome: mark ? mark.outcome : item.outcome,
      reason: mark ? mark.reason ?? null : item.reason,
      quiet: item.area === 'spiritual' || item.untracked,
    }
  })
}

export function summarize(items: readonly ViewItem[]): DaySummary {
  const counted = items.filter((i) => i.expected && !i.quiet)
  const count = (outcome: DayItem['outcome']) => counted.filter((i) => i.outcome === outcome).length
  const done = count('done')
  const partial = count('partial')
  const toneOf = (i: ViewItem): RingTone => (i.outcome === 'done' ? 'done' : i.outcome === 'partial' ? 'partial' : 'rest')
  const tones: RingTone[] = counted.length <= MAX_SEGMENTS
    ? counted.map(toneOf)
    : Array.from({ length: MAX_SEGMENTS }, (_, n): RingTone => {
      const at = ((n + 0.5) / MAX_SEGMENTS) * counted.length
      return at < done ? 'done' : at < done + partial ? 'partial' : 'rest'
    })
  return { total: counted.length, done, partial, skipped: count('skipped'), open: count('open'), tones }
}

/** Kapanış listesi: hâlâ açık olanlar ve bu oturumda dokunulanlar (karar değiştirilebilsin diye yerinde kalır). */
export function closureItems(items: readonly ViewItem[], touched: readonly string[]): ViewItem[] {
  return items.filter((i) => (i.expected && i.outcome === 'open') || touched.includes(i.key))
}

/**
 * Ertelenenler ekrandaki öğelerden kurulur, anlatı yalnızca not verir: şu an `done` olan öğe
 * satır olmaz (bayat AI satırı görünmez), manevi/sayaçsız (quiet) öğe gösterilmez. Notlar
 * başlıkla eşlenir ve sırayla tüketilir: aynı başlıklı iki öğe birbirinin notunu ezmez.
 */
export function postponedRows(items: readonly ViewItem[], narrative: DayNarrative | null): PostponedRow[] {
  const notes = new Map<string, string[]>()
  for (const p of narrative?.postponed ?? []) notes.set(p.title, [...(notes.get(p.title) ?? []), p.note])
  return items.flatMap((i) => {
    if (i.outcome !== 'partial' && i.outcome !== 'skipped') return []
    // Quiet öğe de sıradaki notu tüketir: aynı başlıklı sonraki öğe onun notunu almasın.
    const note = notes.get(i.title)?.shift() ?? null
    if (i.quiet) return []
    return [{ key: i.key, title: i.title, outcome: i.outcome, reason: i.reason, note }]
  })
}

export function programRows(items: readonly ViewItem[]): ProgramRow[] {
  const rows = new Map<string, ProgramRow>()
  for (const item of items) {
    if (!item.program || item.quiet) continue
    const id = `${item.title}|${item.program.target}`
    const seen = rows.get(id)
    rows.set(id, {
      title: item.title,
      target: item.program.target,
      done: Math.max(seen?.done ?? 0, item.program.done),
      advanced: (seen?.advanced ?? false) || item.outcome === 'done',
    })
  }
  return [...rows.values()]
}

/** Haftalık sayım satırları; manevi alandaki alışkanlık sayıyla gösterilmez. */
export function habitRows(report: DailyReport): HabitWeek[] {
  return report.facts.habits_week.filter((h) => h.target > 0 && h.area !== 'spiritual')
}

/** Anlatı yoksa (beklenmez) iyi gidenler tamamlanan işlerin adlarından kurulur. */
export function wentWellLines(items: readonly ViewItem[], narrative: DayNarrative | null): string[] {
  if (narrative) return narrative.went_well
  return items.filter((i) => i.outcome === 'done').map((i) => i.title)
}

export function hasVitals(report: DailyReport): boolean {
  const { movement, focus_minutes, nutrition } = report.facts
  return (movement.exercise_minutes ?? 0) > 0 || (movement.steps ?? 0) > 0 || movement.workout_done
    || focus_minutes > 0 || nutrition !== null
}

// Biçimlendirme

export type Lang = 'tr' | 'en'

const localeOf = (lang: Lang) => (lang === 'tr' ? 'tr-TR' : 'en-US')

export function formatNumber(value: number, lang: Lang): string {
  return new Intl.NumberFormat(localeOf(lang)).format(Math.round(value))
}

/** '2026-10-05' → '5 Ekim Pazartesi' */
export function formatDay(date: string, lang: Lang, short = false): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Intl.DateTimeFormat(localeOf(lang), short
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'long', weekday: 'long' },
  ).format(new Date(y, m - 1, d))
}

/** "{ad}" yer tutucularını doldurur. */
export function fill(template: string, vars: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''))
}
