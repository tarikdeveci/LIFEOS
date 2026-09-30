/**
 * Canlı antrenman ekranının hesapları: setleri hareketlere böler, sıradaki
 * hareketi ve ilerlemeyi bulur. Saf fonksiyonlar, veritabanına dokunmaz.
 */

import type { CreateWorkoutSetInput, ProgramExercise, WorkoutSet } from '../types/workout'

/** Bozuk program verisine karşı hareket başına set sınırı. */
export const MAX_PROGRAM_SETS = 12

/**
 * Program gününün setleri, programdaki hareket sırasıyla. Her satır bir önceki
 * satırdan 1 ms sonra yazılmış sayılır: tek insert'te hepsi aynı now()'ı alıyor,
 * set güncellendikçe satırlar diskte yer değiştiriyor ve created_at sırası
 * eşitlikte hareketleri karıştırıyordu.
 */
export function programDaySetRows(
  workoutId: string,
  exercises: readonly Pick<ProgramExercise, 'exercise_id' | 'sets' | 'reps' | 'rest_seconds' | 'order_index'>[],
  startMs: number,
): CreateWorkoutSetInput[] {
  const ordered = [...exercises].sort((a, b) => a.order_index - b.order_index)
  const rows = ordered.flatMap((ex) => {
    const count = Math.min(MAX_PROGRAM_SETS, Math.max(1, Number.isFinite(ex.sets) ? Math.floor(ex.sets) : 3))
    return Array.from({ length: count }, (_, i) => ({
      workout_id: workoutId,
      exercise_id: ex.exercise_id,
      set_number: i + 1,
      reps: ex.reps ?? 10,
      rest_seconds: ex.rest_seconds,
    }))
  })
  return rows.map((row, i) => ({ ...row, created_at: new Date(startMs + i).toISOString() }))
}

export interface ExerciseSetGroup {
  exerciseId: string
  exercise: WorkoutSet['exercise']
  /** set_number sırasına göre. */
  sets: WorkoutSet[]
}

/**
 * Setleri hareketlere böler; hareketler setlerin geliş sırasında ilk
 * görüldükleri yerde durur. Program günüyle açılan antrenmanda bu, programdaki
 * hareket sırasıdır (setler tek toplu insert ile sırayla yazılıyor).
 */
export function groupSetsByExercise(sets: readonly WorkoutSet[]): ExerciseSetGroup[] {
  const groups = new Map<string, ExerciseSetGroup>()
  for (const set of sets) {
    const group = groups.get(set.exercise_id)
    if (group) group.sets.push(set)
    else groups.set(set.exercise_id, { exerciseId: set.exercise_id, exercise: set.exercise, sets: [set] })
  }
  const list = [...groups.values()]
  for (const group of list) group.sets.sort((a, b) => a.set_number - b.set_number)
  return list
}

/** Tamamlanmamış seti olan ilk hareket; hepsi bittiyse -1. */
export function currentGroupIndex(groups: readonly ExerciseSetGroup[]): number {
  return groups.findIndex((g) => g.sets.some((s) => !s.completed))
}

export interface SetEntry {
  weight_kg?: number
  reps?: number
}

const WEIGHT_PATTERN = /^\d{1,3}([.,]\d{1,2})?$/
const REPS_PATTERN = /^\d{1,3}$/

/**
 * Kullanıcının set satırına yazdığı ağırlık ve tekrar. Boş alan yazılmaz,
 * setin mevcut değeri kalır. Okunamayan değer (harf, eksi, 1000 ve üstü,
 * ondalıklı tekrar) null döner: sessizce atlamak seti eksik kaydederdi.
 */
export function parseSetEntry(weight: string, reps: string): SetEntry | null {
  const w = weight.trim()
  const r = reps.trim()
  if (w && !WEIGHT_PATTERN.test(w)) return null
  if (r && !REPS_PATTERN.test(r)) return null
  return {
    ...(w ? { weight_kg: Number(w.replace(',', '.')) } : {}),
    ...(r ? { reps: Number(r) } : {}),
  }
}

/**
 * Bir setin ağırlık önerisi: kendi değeri, yoksa aynı hareketteki önceki
 * setlerin sonuncusunun ağırlığı. Önceki seti 60 kg giren kullanıcı sıradaki
 * sete aynı sayıyı tekrar yazmasın.
 */
export function suggestedWeight(group: ExerciseSetGroup, setId: string): number | null {
  const index = group.sets.findIndex((s) => s.id === setId)
  if (index < 0) return null
  for (let i = index; i >= 0; i--) {
    const weight = group.sets[i]!.weight_kg
    if (weight !== null) return weight
  }
  return null
}
