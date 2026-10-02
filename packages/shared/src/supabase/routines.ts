import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CreateRoutineInput,
  Routine,
  RoutineCompletion,
  UpdateRoutineInput,
} from '../types/routine'

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

/** Rutini kaydeder ve örneklerini hemen üretir (block 90 gün, task 7 gün). */
export async function createRoutine(
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
  // Rutin yazıldı: örnek üretimi başarısız diye hata fırlatılırsa kullanıcı tekrar dener ve
  // ikinci seri oluşur. Bir kez daha denenir; yine olmazsa gece cron'u (00:10) üretir.
  await materializeMyRoutines(supabase)
    .catch(() => materializeMyRoutines(supabase))
    .catch(() => undefined)
  return data as unknown as Routine
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
 */
export async function updateRoutineSeries(
  supabase: Supabase,
  routineId: string,
  input: UpdateRoutineInput,
  fromDate?: string,
): Promise<Routine> {
  const { data, error } = await supabase
    .from('routines')
    .update(input)
    .eq('id', routineId)
    .select()
    .single()

  if (error) throw error
  const { error: rpcError } = await supabase.rpc('regenerate_routine', {
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
