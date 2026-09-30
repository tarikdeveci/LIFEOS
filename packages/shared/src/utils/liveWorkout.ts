/**
 * Canlı antrenman ekranının hesapları: setleri hareketlere böler, sıradaki
 * hareketi ve ilerlemeyi bulur. Saf fonksiyonlar, veritabanına dokunmaz.
 */

import type { WorkoutSet } from '../types/workout'

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
