/**
 * Rutin tarih kuralları. Sunucudaki üretici (054 routine_occurrence_days) ile aynı:
 * gün haftanın seçili günlerinden biri olmalı ve starts_on'un Pazartesisinden
 * itibaren sayılan hafta every_n_weeks'in katı olmalı. İstemci bunu önizleme ve
 * alışkanlık ilerlemesi için kullanır; gerçek satırları sunucu üretir.
 */

import type { RoutineCompletion, RoutineSchedule } from '../types/routine'
import { daysBetween, fromDateString, shiftIsoDate, toDateString, weekStart } from './date'

/** Pazartesi başlangıçlı hafta çapası ('YYYY-MM-DD'). Postgres date_trunc('week') ile aynı. */
export function mondayOf(dateStr: string): string {
  return toDateString(weekStart(fromDateString(dateStr)))
}

/** Verilen gün kurala uyuyor mu (istisnalar hariç). */
export function isRoutineDay(schedule: RoutineSchedule, dateStr: string): boolean {
  if (dateStr < schedule.starts_on) return false
  if (schedule.ends_on && dateStr > schedule.ends_on) return false
  const dow = fromDateString(dateStr).getDay()
  if (!schedule.days_of_week.includes(dow as RoutineSchedule['days_of_week'][number])) return false
  const weekIndex = Math.floor(daysBetween(mondayOf(schedule.starts_on), dateStr) / 7)
  return weekIndex % Math.max(1, schedule.every_n_weeks) === 0
}

/** [from, to] aralığında (ikisi dahil) rutinin düştüğü günler, istisnalar çıkarılmış. */
export function routineOccurrenceDates(
  schedule: RoutineSchedule,
  from: string,
  to: string,
  exceptions: readonly string[] = [],
): string[] {
  const skip = new Set(exceptions)
  const out: string[] = []
  for (let d = from; d <= to; d = shiftIsoDate(d, 1)) {
    if (!skip.has(d) && isRoutineDay(schedule, d)) out.push(d)
  }
  return out
}

export interface HabitWeekProgress {
  done: number
  target: number
  /** Haftalık hedef tuttu mu. Kaçırılan tek gün seriyi bozmaz, sadece hafta sayılır. */
  met: boolean
}

/**
 * Hedefi tutan günler. Günde N kez alışkanlıkta sayaç N'ye ulaşmayan gün sayılmaz;
 * sayaçsız alışkanlıkta tek işaret yeter.
 */
export function habitDoneDays(
  completions: readonly Pick<RoutineCompletion, 'completed_on' | 'count'>[],
  timesPerDay: number | null,
): string[] {
  const need = timesPerDay ?? 1
  return completions.filter((c) => c.count >= need).map((c) => c.completed_on)
}

/** Alışkanlığın içinde bulunulan haftadaki ilerlemesi ("Bu hafta 2/3"). */
export function habitWeekProgress(
  completedOn: readonly string[],
  target: number,
  today: string,
): HabitWeekProgress {
  const start = mondayOf(today)
  const end = shiftIsoDate(start, 6)
  const done = new Set(completedOn.filter((d) => d >= start && d <= end)).size
  return { done, target, met: done >= target }
}

/**
 * Hedefi tutan ardışık hafta sayısı. İçinde bulunulan hafta henüz bitmediği için
 * hedef tutmadıysa seriyi bozmaz, tuttuysa sayılır.
 */
export function habitWeekStreak(completedOn: readonly string[], target: number, today: string): number {
  const perWeek = new Map<string, Set<string>>()
  for (const d of completedOn) {
    const w = mondayOf(d)
    if (!perWeek.has(w)) perWeek.set(w, new Set())
    perWeek.get(w)!.add(d)
  }
  const met = (week: string) => (perWeek.get(week)?.size ?? 0) >= target

  const thisWeek = mondayOf(today)
  let streak = met(thisWeek) ? 1 : 0
  for (let w = shiftIsoDate(thisWeek, -7); met(w); w = shiftIsoDate(w, -7)) streak++
  return streak
}

/** Bu kadar kez devreden görevde "Hâlâ önemli mi?" sorulur. */
export const CARRY_PROMPT_THRESHOLD = 3

export function shouldAskStillImportant(task: { carry_count: number; routine_id: string | null }): boolean {
  return task.routine_id === null && task.carry_count >= CARRY_PROMPT_THRESHOLD
}

interface RoutineTaskLike {
  id: string
  status: string
  routine_id: string | null
  occurrence_date: string | null
}

/**
 * Görev listesi ve kanban için: bir rutinin açık örneklerinden yalnızca en yakını kalır.
 * Sunucu görev rutinini 7 gün ileriye ürettiğinden aynı kart art arda 7 kez çıkıyordu.
 * `more`: kalan kartın kimliği → arkasına katlanan örnek sayısı. Tamamlanan ve ertelenen
 * örnekler ile sıradan görevler olduğu gibi kalır, sıra korunur.
 */
export function collapseRoutineTasks<T extends RoutineTaskLike>(tasks: readonly T[]): { tasks: T[]; more: Map<string, number> } {
  const isOpen = (task: T) => task.routine_id !== null && task.status !== 'done' && task.status !== 'deferred'
  const nearest = new Map<string, T>()
  const count = new Map<string, number>()
  for (const task of tasks) {
    if (!isOpen(task)) continue
    const key = task.routine_id!
    count.set(key, (count.get(key) ?? 0) + 1)
    const kept = nearest.get(key)
    if (!kept || (task.occurrence_date ?? '') < (kept.occurrence_date ?? '')) nearest.set(key, task)
  }
  const more = new Map<string, number>()
  for (const [key, task] of nearest) {
    const hidden = (count.get(key) ?? 1) - 1
    if (hidden > 0) more.set(task.id, hidden)
  }
  return { tasks: tasks.filter((task) => !isOpen(task) || nearest.get(task.routine_id!) === task), more }
}
