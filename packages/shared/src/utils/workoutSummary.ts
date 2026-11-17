// Bitir akışının saf hesapları: geçen süre ve antrenman özeti.
import type { WorkoutSet } from '../types/workout'
import { best1RM, estimate1RM, type ExerciseSession } from './progression'

export const MIN_WORKOUT_MINUTES = 1
export const MAX_WORKOUT_MINUTES = 300

function clampMinutes(n: number): number {
  return Math.min(MAX_WORKOUT_MINUTES, Math.max(MIN_WORKOUT_MINUTES, Math.round(n)))
}

/** Başlangıçtan şimdiye geçen dakika, 1 ile 300 arasına kırpılır. Okunamayan başlangıçta alt sınır. */
export function elapsedMinutes(startIso: string, nowMs: number): number {
  const start = Date.parse(startIso)
  if (!Number.isFinite(start) || !Number.isFinite(nowMs)) return MIN_WORKOUT_MINUTES
  return clampMinutes((nowMs - start) / 60000)
}

/** Alan boşsa ya da sayı değilse geçen süre (fallback), doluysa 1 ile 300 arasına kırpılmış değer. */
export function resolveDuration(input: string, fallback: number): number {
  const n = parseInt(input.trim(), 10)
  return Number.isFinite(n) ? clampMinutes(n) : clampMinutes(fallback)
}

export interface BrokenRecord {
  exerciseId: string
  /** Yeni en iyi tahmini 1RM (kg). */
  value: number
  /** Önceki en iyi tahmini 1RM (kg). */
  previous: number
}

export interface WorkoutSummary {
  setCount: number
  /** kg x tekrar toplamı; kilosuz setler girmez. */
  volumeKg: number
  records: BrokenRecord[]
}

/**
 * Sayılan (yapılmış) setlerden özet. Rekor: hareketin bu antrenmandaki en iyi tahmini 1RM'i,
 * önceki geçmişin en iyisini aşıyorsa. Geçmişi olmayan hareket rekor sayılmaz (kıyas yok).
 * `history`: hareket id'sine göre önceki seanslar (bu antrenman hariç).
 */
export function summarizeWorkout(
  sets: ReadonlyArray<Pick<WorkoutSet, 'exercise_id' | 'reps' | 'weight_kg'>>,
  history: Readonly<Record<string, ExerciseSession[]>>,
): WorkoutSummary {
  let volumeKg = 0
  const byExercise = new Map<string, ExerciseSession>()
  for (const s of sets) {
    if (s.weight_kg != null && s.weight_kg > 0 && s.reps != null && s.reps > 0) volumeKg += s.weight_kg * s.reps
    const session = byExercise.get(s.exercise_id) ?? { performedAt: '', sets: [] }
    session.sets.push({ reps: s.reps, weight_kg: s.weight_kg, completed: true })
    byExercise.set(s.exercise_id, session)
  }

  const records: BrokenRecord[] = []
  for (const [exerciseId, session] of byExercise) {
    const now = best1RM([session])
    const before = best1RM(history[exerciseId] ?? [])
    if (now && before && now.value > before.value) {
      records.push({ exerciseId, value: now.value, previous: before.value })
    }
  }
  return { setCount: sets.length, volumeKg: Math.round(volumeKg * 10) / 10, records }
}

/**
 * Süren antrenmanda rekor kıran set: hareketin yapılmış setleri içinde tahmini 1RM'i en yüksek olan,
 * önceki geçmişin en iyisini (previousBest) aşıyorsa onun id'si. Geçmiş yoksa (null) kıyas yok, rekor yok.
 * Eşit 1RM'de önce yapılan set rekoru tutar.
 */
export function recordSetId(
  sets: ReadonlyArray<Pick<WorkoutSet, 'id' | 'reps' | 'weight_kg' | 'completed'>>,
  previousBest: number | null,
): string | null {
  if (previousBest === null) return null
  let top: { id: string; value: number } | null = null
  for (const s of sets) {
    if (!s.completed || s.weight_kg == null || s.reps == null) continue
    const value = estimate1RM(s.weight_kg, s.reps)
    if (value !== null && value > previousBest && (top === null || value > top.value)) top = { id: s.id, value }
  }
  return top?.id ?? null
}
