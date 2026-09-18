// Kas analitiği (denge / toparlanma / güç) ve ilerleme önerisi sorguları
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LoggedSet, MuscleExercise } from '../utils/muscles'
import type { ExerciseSession } from '../utils/progression'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any>

/**
 * Kullanıcının belirtilen tarihten itibaren loglanmış tüm setleri, kas
 * grubu bilgisiyle birlikte. Kas dengesi/toparlanma/güç hesapları için tek
 * girdi kaynağı bu: hangi setin hangi kasa ait olduğunu bilmek için
 * exercise + muscle_group join'i gerekiyor.
 *
 * Bir set, egzersizi silinmiş bir harekete aitse (join null dönerse)
 * atlanır: kas grubu bilinmeyen bir seti dengeye katmak yanlış sonuç verir.
 * Üst satırlar antrenman (günde bir), bu yüzden 60 günlük pencere satır
 * sınırına takılmaz.
 */
export async function getRecentLoggedSets(
  supabase: Supabase,
  userId: string,
  sinceDate: string,
): Promise<LoggedSet[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select(`
      date,
      workout_sets(
        reps, weight_kg, duration_seconds, completed,
        exercise:exercises(id, muscle_group_id, secondary_muscle_group_ids, is_bodyweight, category, muscle_group:muscle_groups(*))
      )
    `)
    .eq('user_id', userId)
    .gte('date', sinceDate)
    .order('date', { ascending: false })

  if (error) throw error

  interface SetRow {
    reps: number | null
    weight_kg: number | null
    duration_seconds: number | null
    completed: boolean
    exercise: MuscleExercise | null
  }
  interface Row {
    date: string
    workout_sets: SetRow[] | null
  }

  return (data as unknown as Row[]).flatMap((workout) =>
    (workout.workout_sets ?? [])
      .filter((s): s is SetRow & { exercise: MuscleExercise } => s.exercise !== null)
      .map((s) => ({
        exercise: s.exercise,
        performedAt: workout.date,
        reps: s.reps,
        weight_kg: s.weight_kg,
        duration_seconds: s.duration_seconds,
        completed: s.completed,
      })),
  )
}

/** İlerleme önerisinin geriye baktığı antrenman sayısı (yaklaşık 4-6 ay). */
const SESSION_LOOKBACK_WORKOUTS = 120

/**
 * Bir hareketin geçmiş seansları, en yeni başta. `nextTarget` bir önceki
 * SEANSA bakar, tek bir sete değil.
 *
 * İki hafif sorgu: önce son antrenmanların yalnızca id/tarihi, sonra bu
 * antrenmanlarda o harekete ait setler. Tüm setleri iç içe çekmekten çok daha
 * az veri taşır. excludeWorkoutId, bugün süren antrenmanı hariç tutar: o an
 * aynı harekete set eklerken öneri kendi kendine kıyaslamasın.
 */
export async function getExerciseSessions(
  supabase: Supabase,
  userId: string,
  exerciseId: string,
  limit = 8,
  excludeWorkoutId?: string,
): Promise<ExerciseSession[]> {
  const { data: workouts, error: workoutsError } = await supabase
    .from('workouts')
    .select('id, date')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(SESSION_LOOKBACK_WORKOUTS)
  if (workoutsError) throw workoutsError

  const dates = new Map<string, string>()
  for (const w of (workouts ?? []) as Array<{ id: string; date: string }>) {
    if (w.id !== excludeWorkoutId) dates.set(w.id, w.date)
  }
  if (dates.size === 0) return []

  const { data: sets, error: setsError } = await supabase
    .from('workout_sets')
    .select('workout_id, reps, weight_kg, completed, set_number')
    .eq('exercise_id', exerciseId)
    .in('workout_id', [...dates.keys()])
    .order('set_number', { ascending: true })
  if (setsError) throw setsError

  interface SetRow {
    workout_id: string
    reps: number | null
    weight_kg: number | null
    completed: boolean
  }

  const byWorkout = new Map<string, ExerciseSession>()
  for (const s of (sets ?? []) as SetRow[]) {
    const performedAt = dates.get(s.workout_id)
    if (!performedAt) continue
    const session = byWorkout.get(s.workout_id) ?? { performedAt, sets: [] }
    session.sets.push({ reps: s.reps, weight_kg: s.weight_kg, completed: s.completed })
    byWorkout.set(s.workout_id, session)
  }

  return [...byWorkout.values()]
    .sort((a, b) => b.performedAt.localeCompare(a.performedAt))
    .slice(0, limit)
}
