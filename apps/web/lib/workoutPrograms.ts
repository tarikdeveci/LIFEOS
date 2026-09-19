import type { AiProgramPlan } from '@lifeos/shared'

/** Web'in elle program kurucusundaki satır. */
export interface ManualProgramExercise {
  exercise_id: string
  exercise_name: string
  sets: number
  reps: number
  weight_kg: number
}

export interface ManualProgram {
  name: string
  description: string
  exercises: ManualProgramExercise[]
}

/**
 * `program_exercises` tablosunda ağırlık kolonu yok. Kullanıcının girdiği hedef
 * ağırlık kaybolmasın diye not alanına bu kalıpla yazılır ve programdan
 * antrenman başlatılırken aynı kalıpla geri okunur.
 */
const TARGET_WEIGHT_PATTERN = /Hedef ağırlık: (\d+(?:\.\d+)?) kg/

function targetWeightNote(weightKg: number): string {
  return `Hedef ağırlık: ${weightKg} kg`
}

export function targetWeightFromNotes(notes: string | null | undefined): number | null {
  const match = notes ? TARGET_WEIGHT_PATTERN.exec(notes) : null
  const value = match?.[1] ? Number(match[1]) : NaN
  return Number.isFinite(value) && value > 0 ? value : null
}

/** Elle kurulan program tek günlük bir plan olarak buluta yazılır. */
export function manualProgramToPlan(program: ManualProgram, dayName: string): AiProgramPlan {
  return {
    name: program.name.trim(),
    ...(program.description.trim() ? { description: program.description.trim() } : {}),
    split_type: 'custom',
    days: [{
      day_name: dayName,
      exercises: program.exercises.map((exercise) => ({
        exercise_id: exercise.exercise_id,
        sets: exercise.sets,
        reps: exercise.reps,
        rest_seconds: 90,
        notes: exercise.weight_kg > 0 ? targetWeightNote(exercise.weight_kg) : null,
      })),
    }],
  }
}

/**
 * Eskiden elle kurulan programlar yalnızca bu anahtarla localStorage'a
 * yazılıyordu: mobilde görünmüyor, tarayıcı değişince kayboluyordu.
 */
export function legacyProgramsKey(userId: string): string {
  return `lifeos_programs_${userId}`
}

function isManualProgram(value: unknown): value is ManualProgram {
  if (typeof value !== 'object' || value === null) return false
  const { name, exercises } = value as Record<string, unknown>
  return typeof name === 'string' && name.trim().length > 0 && Array.isArray(exercises) && exercises.length > 0 &&
    exercises.every((exercise: unknown) => {
      if (typeof exercise !== 'object' || exercise === null) return false
      const row = exercise as Record<string, unknown>
      return typeof row['exercise_id'] === 'string' && typeof row['sets'] === 'number'
    })
}

/** localStorage'daki eski programları okur; bozuk ya da boş kayıtları eler. */
export function readLegacyPrograms(raw: string | null): ManualProgram[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isManualProgram).map((program) => ({
      name: program.name,
      description: typeof program.description === 'string' ? program.description : '',
      exercises: program.exercises.map((exercise) => ({
        exercise_id: exercise.exercise_id,
        exercise_name: typeof exercise.exercise_name === 'string' ? exercise.exercise_name : '',
        sets: exercise.sets,
        reps: typeof exercise.reps === 'number' ? exercise.reps : 10,
        weight_kg: typeof exercise.weight_kg === 'number' ? exercise.weight_kg : 0,
      })),
    }))
  } catch {
    return []
  }
}
