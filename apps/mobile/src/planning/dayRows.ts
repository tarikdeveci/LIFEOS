// Rutin formundaki "Günlere göre farklı" satırları ile 082 override satırları arasında
// saf dönüşüm (React Native'siz, node testinden çağrılabilir).
import type { RoutineDayOverride, Weekday } from '@lifeos/shared'

/** Bir günün formdaki hali: ya saat aralığı ya yalnız süre (082). */
export interface DayRow {
  mode: 'time' | 'minutes'
  start: string
  end: string
  minutes: string
}

export type DayRows = Partial<Record<Weekday, DayRow>>

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export function toDayRows(overrides: RoutineDayOverride[]): DayRows {
  const rows: DayRows = {}
  for (const o of overrides) {
    rows[o.day_of_week] = o.start_time
      ? { mode: 'time', start: o.start_time.slice(0, 5), end: (o.end_time ?? '').slice(0, 5), minutes: '' }
      : { mode: 'minutes', start: '', end: '', minutes: String(o.minutes ?? '') }
  }
  return rows
}

type DayError = 'plan_err_time_invalid' | 'plan_err_end_after_start' | 'routines_err_day_minutes'

/** Seçili günlerin satırlarını RPC girdisine çevirir; seçilmeyen günün satırı atılır. */
export function toOverrides(rows: DayRows, days: Weekday[]): RoutineDayOverride[] | DayError {
  const out: RoutineDayOverride[] = []
  for (const d of [...days].sort()) {
    const row = rows[d]
    if (!row) continue
    if (row.mode === 'time') {
      if (!TIME_RE.test(row.start) || !TIME_RE.test(row.end)) return 'plan_err_time_invalid'
      if (row.start === row.end) return 'plan_err_end_after_start'
      out.push({ day_of_week: d, start_time: row.start, end_time: row.end, minutes: null })
    } else {
      const n = Number(row.minutes)
      if (!Number.isInteger(n) || n < 1 || n > 1439) return 'routines_err_day_minutes'
      out.push({ day_of_week: d, start_time: null, end_time: null, minutes: n })
    }
  }
  return out
}
