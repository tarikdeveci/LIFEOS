// CSV içe aktarma (Strong / Hevy / FitNotes) DB yazımı. Ayrıştırma: utils/csvImport.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CreateWorkoutSetInput, Exercise, Workout } from '../types/workout'
import type { ParsedImportWorkout } from '../utils/csvImport'
import { matchExerciseName } from '../utils/exerciseMatch'
import { addWorkoutSets, createWorkout, deleteWorkout } from './workouts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any>

const PAGE_SIZE = 1000
const UNIQUE_VIOLATION = '23505'

export interface CsvImportOutcome {
  workoutsImported: number
  setsImported: number
  exercisesCreated: number
  /** O gün zaten antrenman kayıtlı olduğu için atlanan gün sayısı. */
  daysSkipped: number
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === UNIQUE_VIOLATION
}

/** Verilen tarih aralığında kullanıcının zaten antrenmanı olan günler. */
async function existingWorkoutDates(
  supabase: Supabase,
  userId: string,
  dates: readonly string[],
): Promise<Set<string>> {
  const found = new Set<string>()
  if (dates.length === 0) return found
  const sorted = [...dates].sort()
  const first = sorted[0] ?? ''
  const last = sorted[sorted.length - 1] ?? ''

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('workouts')
      .select('date')
      .eq('user_id', userId)
      .gte('date', first)
      .lte('date', last)
      .order('date')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const rows = (data ?? []) as Array<{ date: string }>
    for (const row of rows) found.add(row.date)
    if (rows.length < PAGE_SIZE) break
  }
  return found
}

/** Katalogda eşleşmeyen adları kullanıcının kendi egzersizi olarak oluşturur, isim -> id döner. */
async function createMissingExercises(
  supabase: Supabase,
  userId: string,
  names: readonly string[],
): Promise<Map<string, string>> {
  if (names.length === 0) return new Map()
  const { data, error } = await supabase
    .from('exercises')
    .insert(names.map((name) => ({ user_id: userId, name, category: 'strength' as const })))
    .select('id, name')
  if (error) throw error

  const map = new Map<string, string>()
  for (const row of data as Array<{ id: string; name: string }>) map.set(row.name, row.id)
  return map
}

/**
 * Ayrıştırılmış CSV antrenmanlarını yazar. Uygulama günde tek antrenman tutar
 * (workouts_user_date_unique_idx), bu yüzden:
 * - zaten antrenmanı olan günler atlanır, üzerine yazılmaz;
 * - aynı dosyayı tekrar içe aktarmak güvenlidir, yazılmış günler atlanır;
 * - setleri yazılamayan gün silinir, yarım kalan içe aktarma tekrar denendiğinde
 *   o gün boş bir antrenman olarak takılı kalmaz.
 * Eşleşmeyen egzersizler yalnızca yazılacak günler için, kullanıcının kendi
 * kaydı olarak oluşturulur (katalog satırlarına dokunulmaz). Setler tamamlanmış
 * olarak yazılır; analitik yalnızca tamamlanan setleri sayar.
 */
export async function importCsvWorkouts(
  supabase: Supabase,
  userId: string,
  workouts: readonly ParsedImportWorkout[],
  catalogExercises: readonly Exercise[],
): Promise<CsvImportOutcome> {
  const existing = await existingWorkoutDates(supabase, userId, workouts.map((w) => w.date))
  const pending = workouts.filter((w) => !existing.has(w.date))
  let daysSkipped = workouts.length - pending.length

  const names = new Set<string>()
  for (const w of pending) for (const s of w.sets) names.add(s.exerciseName)

  const resolved = new Map<string, string>() // exerciseName -> exercise_id
  const missing: string[] = []
  for (const name of names) {
    const match = matchExerciseName(name, catalogExercises)
    if (match) resolved.set(name, match.id)
    else missing.push(name)
  }
  const created = await createMissingExercises(supabase, userId, missing)
  for (const [name, id] of created) resolved.set(name, id)

  let workoutsImported = 0
  let setsImported = 0
  for (const w of pending) {
    let workout: Workout
    try {
      workout = await createWorkout(supabase, userId, {
        date: w.date,
        name: w.name,
        status: 'completed',
        ...(w.durationMinutes !== null ? { duration_minutes: w.durationMinutes } : {}),
      })
    } catch (err) {
      // Bu arada başka cihazdan o güne antrenman açıldıysa: atla, üzerine yazma.
      if (isUniqueViolation(err)) {
        daysSkipped += 1
        continue
      }
      throw importError(err, workoutsImported)
    }

    const inputs: CreateWorkoutSetInput[] = []
    for (const s of w.sets) {
      const exerciseId = resolved.get(s.exerciseName)
      if (!exerciseId) continue
      inputs.push({
        workout_id: workout.id,
        exercise_id: exerciseId,
        set_number: s.setNumber,
        completed: true,
        ...(s.reps !== null ? { reps: s.reps } : {}),
        ...(s.weightKg !== null ? { weight_kg: s.weightKg } : {}),
        ...(s.durationSeconds !== null ? { duration_seconds: s.durationSeconds } : {}),
        ...(s.distanceM !== null ? { distance_m: s.distanceM } : {}),
      })
    }

    try {
      if (inputs.length === 0) throw new Error('Günün hiçbir seti yazılabilir değil')
      await addWorkoutSets(supabase, inputs)
    } catch (err) {
      await removeQuietly(supabase, workout.id)
      throw importError(err, workoutsImported)
    }
    workoutsImported += 1
    setsImported += inputs.length
  }

  return { workoutsImported, setsImported, exercisesCreated: created.size, daysSkipped }
}

async function removeQuietly(supabase: Supabase, workoutId: string): Promise<void> {
  try {
    await deleteWorkout(supabase, workoutId)
  } catch {
    // Silme de başarısızsa asıl hatayı gölgelemesin.
  }
}

function importError(err: unknown, done: number): Error {
  // PostgrestError her sürümde Error örneği değil; message alanı yine de var.
  const raw = typeof err === 'object' && err !== null ? (err as { message?: unknown }).message : undefined
  const message = typeof raw === 'string' && raw ? raw : 'Bilinmeyen hata'
  return new Error(
    done > 0
      ? `${done} antrenman aktarıldıktan sonra hata oluştu: ${message}. Tekrar denersen aktarılan günler atlanır.`
      : message,
  )
}
