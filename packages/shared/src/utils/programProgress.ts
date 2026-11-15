/**
 * Aktif antrenman programı ve sıradaki gün.
 *
 * Veritabanında "aktif program" alanı yok. Programdan başlatılan antrenman
 * `${program.name} · ${günAdı}` adıyla yazılır (`useWorkoutSession`); en son
 * böyle başlatılan antrenman hangi programın hangi gününe aitse program o,
 * sıradaki gün de bir sonraki çalışma günüdür. Kaçırılan takvim günü sırayı
 * kaydırmaz: sıra yapılan antrenmana göre ilerler.
 */

import type { ProgramDay, ProgramExercise, Workout, WorkoutProgram } from '../types'
import { fromDateString } from './date'

/** Antrenman adında program adı ile gün adı arasındaki ayraç. */
export const PROGRAM_DAY_SEPARATOR = ' · '

/**
 * Bütün yazmalar bitene kadar bekler, sonra ilk hatayı fırlatır. `Promise.all`
 * ilk hatada döner ve kalan yazmalar ardından gelen yenilemeden sonra biter;
 * ekran veritabanından eski kalır.
 */
export async function settleAll(writes: Promise<unknown>[]): Promise<void> {
  const failed = (await Promise.allSettled(writes)).find((r) => r.status === 'rejected')
  if (failed) throw (failed as PromiseRejectedResult).reason
}

export interface ProgramProgress {
  program: WorkoutProgram
  /** Sıradaki çalışma günü. */
  nextDay: ProgramDay
  /** Programdan son antrenmanın tarihi ('YYYY-MM-DD'). */
  lastDate: string
}

/** Programın çalışma günleri, sırayla; dinlenme günleri sayılmaz. */
export function workingDays(program: WorkoutProgram): ProgramDay[] {
  return [...(program.days ?? [])]
    .filter((d) => !d.is_rest)
    .sort((a, b) => a.day_number - b.day_number)
}

/**
 * En son programdan başlatılan antrenmana göre aktif program ve sıradaki gün.
 * `dayLabel` antrenman adına yazılan gün adını üretir (boş adlı günde "Gün 3").
 * `maxAgeDays` günden eski antrenman programı aktif saymaz.
 */
export function findProgramProgress(
  programs: WorkoutProgram[],
  history: Workout[],
  today: string,
  dayLabel: (day: ProgramDay) => string,
  maxAgeDays = 28,
): ProgramProgress | null {
  // Aynı adlı şablon ve kopya varsa kullanıcının kendi programı, sonra en uzun ad eşleşir.
  const candidates = [...programs].sort((a, b) =>
    Number(b.user_id !== null) - Number(a.user_id !== null) || b.name.length - a.name.length)
  const todayTime = fromDateString(today).getTime()
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))

  for (const workout of sorted) {
    const age = (todayTime - fromDateString(workout.date).getTime()) / 86400000
    if (age > maxAgeDays) return null
    // Atlanan antrenman yapılmamıştır, ileri tarihli olan henüz yapılmadı: sırayı ilerletmez.
    if (workout.status === 'skipped' || age < 0) continue
    const name = workout.name?.trim()
    if (!name) continue
    const program = candidates.find((p) => name.startsWith(p.name + PROGRAM_DAY_SEPARATOR))
    if (!program) continue
    const days = workingDays(program)
    if (days.length === 0) continue
    const suffix = name.slice(program.name.length + PROGRAM_DAY_SEPARATOR.length)
    const index = days.findIndex((d) => dayLabel(d) === suffix)
    const nextDay = days[(index + 1) % days.length]
    if (!nextDay) continue
    return { program, nextDay, lastDate: workout.date }
  }
  return null
}

/**
 * Bir hareketi gün içinde yeni sıraya taşır. Sıra 1'den başlayıp boşluksuz
 * yeniden numaralanır; yalnız sırası değişen satırlar döner.
 */
export function reorderProgramExercises(
  exercises: Pick<ProgramExercise, 'id' | 'order_index'>[],
  rowId: string,
  newPosition: number,
): { id: string; order_index: number }[] {
  const sorted = [...exercises].sort((a, b) => a.order_index - b.order_index)
  const from = sorted.findIndex((e) => e.id === rowId)
  if (from < 0) return []
  const to = Math.min(sorted.length - 1, Math.max(0, newPosition - 1))
  const [moved] = sorted.splice(from, 1)
  if (!moved) return []
  sorted.splice(to, 0, moved)
  return sorted
    .map((e, i) => ({ id: e.id, order_index: i + 1, before: e.order_index }))
    .filter((e) => e.order_index !== e.before)
    .map(({ id, order_index }) => ({ id, order_index }))
}
