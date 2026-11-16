import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CreateRoutineInput,
  Routine,
  RoutineCompletion,
  RoutineDayOverride,
  RoutineProgress,
  UpdateRoutineInput,
} from '../types/routine'
import type { Workout } from '../types/workout'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any>

// Örnek satırları (time_blocks / tasks) sunucu üretir; buradaki fonksiyonlar sadece
// şablonu yazar ve üreticiyi tetikler. Tek örneği düzenlemek veya silmek için
// sıradan updateTimeBlock / deleteTimeBlock / task fonksiyonları yeterli: 054'teki
// tetikleyiciler düzenlemeyi "sadece bu", silmeyi "o gün bir daha üretme" sayar.

export async function getRoutines(supabase: Supabase, userId: string): Promise<Routine[]> {
  const { data, error } = await supabase
    .from('routines')
    .select('*')
    .eq('user_id', userId)
    .order('start_time', { ascending: true, nullsFirst: false })
    .order('created_at')

  if (error) throw error
  return data as unknown as Routine[]
}

/** Sadece şablonu yazar (1 istek); örnekler `generateRoutineInstancesFor` ile üretilir. */
export async function insertRoutine(
  supabase: Supabase,
  userId: string,
  input: CreateRoutineInput,
): Promise<Routine> {
  const { data, error } = await supabase
    .from('routines')
    .insert({
      ...input,
      user_id: userId,
      times_per_week: input.kind === 'habit' ? input.times_per_week : null,
      times_per_day: input.kind === 'habit' ? input.times_per_day ?? null : null,
    })
    .select()
    .single()

  if (error) throw error
  return data as unknown as Routine
}

/**
 * Rutin yazıldıktan sonra örnekleri üretir (block 90 gün, task 7 gün). Başarısızlık hata
 * fırlatmaz: fırlatılırsa kullanıcı tekrar dener ve ikinci seri oluşur. Bir kez daha denenir;
 * yine olmazsa gece cron'u (00:10) üretir.
 */
async function generateRoutineInstances(supabase: Supabase): Promise<void> {
  await materializeMyRoutines(supabase)
    .catch(() => materializeMyRoutines(supabase))
    .catch(() => undefined)
}

/** Rutinin güne göre farklı saat ve süreleri (082). */
export async function getRoutineDayOverrides(supabase: Supabase, routineId: string): Promise<RoutineDayOverride[]> {
  const { data, error } = await supabase
    .from('routine_day_overrides')
    .select('day_of_week, start_time, end_time, minutes')
    .eq('routine_id', routineId)
    .order('day_of_week')

  if (error) throw error
  return data as unknown as RoutineDayOverride[]
}

/**
 * Override listesini tümüyle değiştirir ([] = hepsini kaldır) ve fromDate'den (en erken bugün)
 * itibaren örnekleri yeniden üretir; elle düzenlenmiş ve bitmiş örnekler kalır.
 */
export async function setRoutineDayOverrides(
  supabase: Supabase,
  routineId: string,
  overrides: RoutineDayOverride[],
  fromDate?: string,
): Promise<void> {
  const { error } = await supabase.rpc('set_routine_day_overrides', {
    p_routine: routineId,
    p_overrides: overrides,
    p_from: fromDate ?? null,
  })
  if (error) throw error
}

/**
 * Override'lı yeni rutinin örneklerini üretir: RPC hem yazar hem üretir. Başarısızsa örnekler
 * şablonla üretilir (rutin kayıtlı kalır, kullanıcı farklı günleri düzenlemede yeniden kurar).
 */
async function generateWithOverrides(
  supabase: Supabase,
  routineId: string,
  overrides: RoutineDayOverride[] | undefined,
): Promise<void> {
  if (!overrides?.length) return generateRoutineInstances(supabase)
  await setRoutineDayOverrides(supabase, routineId, overrides)
    .catch(() => generateRoutineInstances(supabase))
}

/** Rutini kaydeder ve örneklerini hemen üretir: 2 ardışık istek (yazma, üretim). */
export async function createRoutine(
  supabase: Supabase,
  userId: string,
  input: CreateRoutineInput,
  overrides?: RoutineDayOverride[],
): Promise<Routine> {
  const routine = await insertRoutine(supabase, userId, input)
  await generateWithOverrides(supabase, routine.id, overrides)
  return routine
}

/** Şablon yazıldıktan sonra arka planda üretim (store'un hızlı kayıt yolu). */
export function generateRoutineInstancesFor(
  supabase: Supabase,
  routineId: string,
  overrides?: RoutineDayOverride[],
): Promise<void> {
  return generateWithOverrides(supabase, routineId, overrides)
}

/**
 * Şablon güncellendi ama örnekler yeniden üretilemedi. Ekran yeni şablonu göstermeli (eskiye
 * dönerse veritabanıyla ayrışır); aynı güncellemeyi tekrar denemek güvenli.
 */
export class RoutineRegenerateError extends Error {
  readonly routine: Routine
  readonly reason: unknown
  constructor(routine: Routine, reason: unknown) {
    super('regenerate_routine')
    this.routine = routine
    this.reason = reason
  }
}

/**
 * "Bu ve sonrakiler": şablonu günceller, fromDate'den (en erken bugün) itibaren
 * elle düzenlenmemiş ve bitmemiş örnekleri yeni şablonla yeniden üretir.
 * Geçmiş ve "sadece bu" ile değiştirilmiş örnekler olduğu gibi kalır.
 * overrides verilirse güne göre saatler de değişir; yeniden üretim tek RPC'de olur.
 */
export async function updateRoutineSeries(
  supabase: Supabase,
  routineId: string,
  input: UpdateRoutineInput,
  fromDate?: string,
  overrides?: RoutineDayOverride[],
): Promise<Routine> {
  const { data, error } = await supabase
    .from('routines')
    .update(input)
    .eq('id', routineId)
    .select()
    .single()

  if (error) throw error
  const { error: rpcError } = overrides
    ? await supabase.rpc('set_routine_day_overrides', {
        p_routine: routineId,
        p_overrides: overrides,
        p_from: fromDate ?? null,
      })
    : await supabase.rpc('regenerate_routine', {
        p_routine: routineId,
        p_from: fromDate ?? null,
      })
  if (rpcError) throw new RoutineRegenerateError(data as unknown as Routine, rpcError)
  return data as unknown as Routine
}

/** Seriyi siler: bugünden itibaren bitmemiş örnekler gider, geçmiş kayıtlar kalır. */
export async function deleteRoutine(supabase: Supabase, routineId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_routine', { p_routine: routineId })
  if (error) throw error
}

export async function materializeMyRoutines(supabase: Supabase): Promise<number> {
  const { data, error } = await supabase.rpc('materialize_my_routines')
  if (error) throw error
  return (data as number | null) ?? 0
}

/** Sayaçlı rutinlerin (target_count) biten oturum sayıları: "X/42". RPC auth.uid() ile süzer. */
export async function getRoutineProgress(supabase: Supabase): Promise<RoutineProgress[]> {
  const { data, error } = await supabase.rpc('my_routine_progress')
  if (error) throw error
  return (data as RoutineProgress[] | null) ?? []
}

/** Alışkanlık tamamlamaları, [from, to] dahil. */
export async function getRoutineCompletions(
  supabase: Supabase,
  userId: string,
  from: string,
  to: string,
): Promise<RoutineCompletion[]> {
  const { data, error } = await supabase
    .from('routine_completions')
    .select('*')
    .eq('user_id', userId)
    .gte('completed_on', from)
    .lte('completed_on', to)

  if (error) throw error
  return data as unknown as RoutineCompletion[]
}

/** Alışkanlığın o günkü sayacını yazar; 0 işareti kaldırır. */
export async function setHabitCount(
  supabase: Supabase,
  userId: string,
  routineId: string,
  day: string,
  count: number,
): Promise<void> {
  if (count > 0) {
    const { error } = await supabase
      .from('routine_completions')
      .upsert(
        { routine_id: routineId, user_id: userId, completed_on: day, count },
        { onConflict: 'routine_id,completed_on' },
      )
    if (error) throw error
    return
  }

  const { error } = await supabase
    .from('routine_completions')
    .delete()
    .eq('routine_id', routineId)
    .eq('completed_on', day)
  if (error) throw error
}

/** Programa bağlı rutinlerin bugünden sonraki blokları (program günü dağıtımı için). */
export async function getUpcomingRoutineBlocks(
  supabase: Supabase,
  routineIds: string[],
  fromDate: string,
): Promise<Array<{ id: string; routine_id: string; date: string; start_time: string }>> {
  if (routineIds.length === 0) return []
  const { data, error } = await supabase
    .from('time_blocks')
    .select('id, routine_id, date, start_time')
    .in('routine_id', routineIds)
    .gte('date', fromDate)
    .order('date')
    .order('start_time')
    .limit(1000)
  if (error) throw error
  return (data ?? []) as Array<{ id: string; routine_id: string; date: string; start_time: string }>
}

/** Programlardan yapılan son antrenmanlar; `fetchHistory`nin 14 kayıtlık penceresi başka programlarla dolabilir. */
export async function getProgramWorkoutHistory(supabase: Supabase, userId: string): Promise<Workout[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select('*')
    .eq('user_id', userId)
    .like('name', '%·%')
    .order('date', { ascending: false })
    .limit(60)
  if (error) throw error
  return (data ?? []) as Workout[]
}
