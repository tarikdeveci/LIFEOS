import type { ProgramDay, WorkoutProgram } from '@lifeos/shared'
import type { Language, Translations } from '../../i18n'
import { exerciseName } from './labels'

/** Programın planlanabilir günleri: dinlenme günleri takvime yazılmaz. */
export function activeDays(program: WorkoutProgram | null): ProgramDay[] {
  return [...(program?.days ?? [])]
    .filter((d) => !d.is_rest)
    .sort((a, b) => a.day_number - b.day_number)
}

/** Takvim etkinliğinin not alanı: o günün hareket listesi. */
export function describeDay(day: ProgramDay | undefined, lang: Language, t: Translations): string {
  const exercises = [...(day?.exercises ?? [])].sort((a, b) => a.order_index - b.order_index)
  if (exercises.length === 0) return ''
  return exercises
    .map((ex) => `• ${exerciseName(ex.exercise, lang, t)} ${ex.sets}×${ex.reps ?? '-'}`)
    .join('\n')
}

/** Günün adı; ad boşsa sıra numarasıyla ("Gün 3"). */
export function programDayLabel(day: { day_name: string | null; day_number: number }, t: Translations): string {
  return day.day_name?.trim() || t.wk_day_n.replace('{n}', String(day.day_number))
}
