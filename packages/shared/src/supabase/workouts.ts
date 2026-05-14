// Supabase workout query fonksiyonları
import type { SupabaseClient } from '@supabase/supabase-js'
import { toDateString } from '../utils/date'
import type {
  Exercise,
  MuscleGroup,
  Workout,
  WorkoutSet,
  CreateWorkoutInput,
  CreateWorkoutSetInput,
  UpdateWorkoutSetInput,
  WorkoutStatus,
  WorkoutProgram,
  CreateProgramInput,
} from '../types/workout'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any>

// -------------------------------------------------------
// Egzersiz Kütüphanesi
// -------------------------------------------------------

export async function getMuscleGroups(supabase: Supabase): Promise<MuscleGroup[]> {
  const { data, error } = await supabase
    .from('muscle_groups')
    .select('*')
    .order('body_region', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return data as MuscleGroup[]
}

export async function getExercises(
  supabase: Supabase,
  filters?: { category?: string; muscle_group_id?: number; userId?: string },
): Promise<Exercise[]> {
  let query = supabase
    .from('exercises')
    .select('*, muscle_group:muscle_groups(*)')
    .order('name', { ascending: true })

  if (filters?.category) query = query.eq('category', filters.category)
  if (filters?.muscle_group_id) query = query.eq('muscle_group_id', filters.muscle_group_id)

  const { data, error } = await query
  if (error) throw error
  return data as Exercise[]
}

// -------------------------------------------------------
// Antrenman Seansları
// -------------------------------------------------------

export async function getWorkouts(
  supabase: Supabase,
  userId: string,
  limit = 30,
): Promise<Workout[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data as Workout[]
}

export async function getWorkoutByDate(
  supabase: Supabase,
  userId: string,
  date: string,
): Promise<Workout | null> {
  const { data, error } = await supabase
    .from('workouts')
    .select('*, workout_sets(*, exercise:exercises(*, muscle_group:muscle_groups(*)))')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle()
  if (error) throw error
  return data as Workout | null
}

export async function createWorkout(
  supabase: Supabase,
  userId: string,
  input: CreateWorkoutInput,
): Promise<Workout> {
  const { data, error } = await supabase
    .from('workouts')
    .insert({ user_id: userId, ...input })
    .select()
    .single()
  if (error) throw error
  return data as Workout
}

export async function updateWorkout(
  supabase: Supabase,
  workoutId: string,
  updates: Partial<Pick<Workout, 'name' | 'notes' | 'status' | 'duration_minutes' | 'total_calories_burned' | 'ai_plan'>>,
): Promise<Workout> {
  const { data, error } = await supabase
    .from('workouts')
    .update(updates)
    .eq('id', workoutId)
    .select()
    .single()
  if (error) throw error
  return data as Workout
}

export async function deleteWorkout(supabase: Supabase, workoutId: string): Promise<void> {
  const { error } = await supabase.from('workouts').delete().eq('id', workoutId)
  if (error) throw error
}

// -------------------------------------------------------
// Antrenman Setleri
// -------------------------------------------------------

export async function getWorkoutSets(
  supabase: Supabase,
  workoutId: string,
): Promise<WorkoutSet[]> {
  const { data, error } = await supabase
    .from('workout_sets')
    .select('*, exercise:exercises(*, muscle_group:muscle_groups(*))')
    .eq('workout_id', workoutId)
    .order('set_number', { ascending: true })
  if (error) throw error
  return data as WorkoutSet[]
}

export async function addWorkoutSet(
  supabase: Supabase,
  input: CreateWorkoutSetInput,
): Promise<WorkoutSet> {
  const { data, error } = await supabase
    .from('workout_sets')
    .insert(input)
    .select('*, exercise:exercises(*, muscle_group:muscle_groups(*))')
    .single()
  if (error) throw error
  return data as WorkoutSet
}

export async function updateWorkoutSet(
  supabase: Supabase,
  setId: string,
  updates: UpdateWorkoutSetInput,
): Promise<WorkoutSet> {
  const { data, error } = await supabase
    .from('workout_sets')
    .update(updates)
    .eq('id', setId)
    .select('*, exercise:exercises(*, muscle_group:muscle_groups(*))')
    .single()
  if (error) throw error
  return data as WorkoutSet
}

export async function deleteWorkoutSet(supabase: Supabase, setId: string): Promise<void> {
  const { error } = await supabase.from('workout_sets').delete().eq('id', setId)
  if (error) throw error
}

export async function completeWorkout(
  supabase: Supabase,
  workoutId: string,
  durationMinutes: number,
  totalCaloriesBurned?: number,
): Promise<Workout> {
  await supabase
    .from('workout_sets')
    .update({ completed: true })
    .eq('workout_id', workoutId)

  return updateWorkout(supabase, workoutId, {
    status: 'completed' as WorkoutStatus,
    duration_minutes: durationMinutes,
    ...(totalCaloriesBurned !== undefined && totalCaloriesBurned > 0
      ? { total_calories_burned: totalCaloriesBurned }
      : {}),
  })
}

// 7 günlük antrenman istatistiği — haftalık chart için
export async function getWeeklyWorkoutStats(
  supabase: Supabase,
  userId: string,
  startDate: string, // 'YYYY-MM-DD' (haftanın başı)
): Promise<Array<{ date: string; status: WorkoutStatus | 'none'; caloriesBurned: number }>> {
  const [y, m, d] = startDate.split('-').map(Number) as [number, number, number]
  const endDate = toDateString(new Date(y, m - 1, d + 6))

  const { data, error } = await supabase
    .from('workouts')
    .select('date, status, total_calories_burned')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)

  if (error) throw error

  return (data as Array<{ date: string; status: WorkoutStatus; total_calories_burned: number | null }>).map(
    (w) => ({
      date: w.date,
      status: w.status,
      caloriesBurned: w.total_calories_burned ?? 0,
    }),
  )
}

// Kalori tahmini: MET * ağırlık_kg * süre_saat
export function estimateCalories(
  metValue: number,
  weightKg: number,
  durationMinutes: number,
): number {
  return Math.round(metValue * weightKg * (durationMinutes / 60))
}

// -------------------------------------------------------
// Workout Programs
// -------------------------------------------------------

export async function getWorkoutPrograms(
  supabase: Supabase,
  userId: string,
): Promise<WorkoutProgram[]> {
  const { data, error } = await supabase
    .from('workout_programs')
    .select(`
      *,
      days:program_days(
        *,
        exercises:program_exercises(
          *,
          exercise:exercises(*)
        )
      )
    `)
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data as WorkoutProgram[]
}

export async function createWorkoutProgram(
  supabase: Supabase,
  userId: string,
  input: CreateProgramInput,
): Promise<WorkoutProgram> {
  const { data, error } = await supabase
    .from('workout_programs')
    .insert({ ...input, user_id: userId })
    .select()
    .single()

  if (error) throw error
  return data as WorkoutProgram
}

export async function deleteWorkoutProgram(
  supabase: Supabase,
  programId: string,
): Promise<void> {
  const { error } = await supabase
    .from('workout_programs')
    .delete()
    .eq('id', programId)

  if (error) throw error
}
