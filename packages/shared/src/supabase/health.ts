import type { SupabaseClient } from '@supabase/supabase-js'
import { shiftIsoDate, todayDate } from '../utils/date'
import {
  DEFAULT_HEALTH_SETTINGS,
  type HealthDaily,
  type HealthDailyInput,
  type HealthSettings,
  type HealthSettingsUpdate,
} from '../types/health'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any>

/**
 * Bir günün sağlık özetini yazar. Aynı gün tekrar senkronize edilirse üzerine
 * yazılır (user_id + date primary key).
 *
 * Yalnızca gelen alanlar güncellenir: `undefined` bırakılan metrikler upsert'e
 * hiç girmez, böylece iOS'ta uyku okunmadığında mevcut değer silinmez.
 */
export async function upsertHealthDaily(
  supabase: Supabase,
  userId: string,
  input: HealthDailyInput,
): Promise<void> {
  const row: Record<string, unknown> = {
    user_id: userId,
    date: input.date,
    source: input.source,
    synced_at: new Date().toISOString(),
  }

  const metrics: Array<keyof HealthDailyInput> = [
    'steps',
    'distance_m',
    'active_energy_kcal',
    'exercise_minutes',
    'workout_count',
    'sleep_minutes',
    'sleep_start',
    'sleep_end',
    'resting_heart_rate',
    'avg_heart_rate',
  ]

  for (const key of metrics) {
    const value = input[key]
    if (value !== undefined) row[key] = value
  }

  const { error } = await supabase
    .from('health_daily')
    .upsert(row, { onConflict: 'user_id,date' })

  if (error) throw error
}

/** Tek günün özeti; kayıt yoksa null */
export async function getHealthDay(
  supabase: Supabase,
  userId: string,
  date: string = todayDate(),
): Promise<HealthDaily | null> {
  const { data, error } = await supabase
    .from('health_daily')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle()

  if (error) throw error
  return (data as HealthDaily | null) ?? null
}

/**
 * Son `days` günün özetleri, tarihe göre artan sıralı.
 * Taban çizgisi (dinlenme nabzı) ve trend hesapları için kullanılır.
 */
export async function getHealthRange(
  supabase: Supabase,
  userId: string,
  days = 7,
  endDate: string = todayDate(),
): Promise<HealthDaily[]> {
  const startDate = shiftIsoDate(endDate, -(days - 1))

  const { data, error } = await supabase
    .from('health_daily')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date')

  if (error) throw error
  return (data ?? []) as HealthDaily[]
}

/**
 * Ayarları getirir; satır yoksa varsayılanlarla oluşturur.
 *
 * Kayıt sırasında trigger ile satır açmıyoruz — auth.users trigger'ları bu
 * projede daha önce signup'ı bozdu (bkz. 014, 022). Bunun yerine ilk okumada
 * tembel oluşturuyoruz.
 */
export async function getHealthSettings(
  supabase: Supabase,
  userId: string,
): Promise<HealthSettings> {
  const { data, error } = await supabase
    .from('health_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (data) return data as HealthSettings

  const { data: created, error: insertError } = await supabase
    .from('health_settings')
    .upsert({ user_id: userId, ...DEFAULT_HEALTH_SETTINGS }, { onConflict: 'user_id' })
    .select()
    .single()

  if (insertError) throw insertError
  return created as HealthSettings
}

/**
 * Ayarları kısmi olarak günceller.
 *
 * Upsert kullanılmıyor: varsayılanları da göndermek zorunda kalırdık ve tek bir
 * alanı değiştirmek kullanıcının adım hedefini sessizce 8000'e döndürürdü.
 * Satır yoksa varsayılanlarla oluşturulur.
 */
export async function updateHealthSettings(
  supabase: Supabase,
  userId: string,
  updates: HealthSettingsUpdate,
): Promise<HealthSettings> {
  const { data, error } = await supabase
    .from('health_settings')
    .update(updates)
    .eq('user_id', userId)
    .select()
    .maybeSingle()

  if (error) throw error
  if (data) return data as HealthSettings

  const { data: created, error: insertError } = await supabase
    .from('health_settings')
    .upsert({ user_id: userId, ...DEFAULT_HEALTH_SETTINGS, ...updates }, { onConflict: 'user_id' })
    .select()
    .single()

  if (insertError) throw insertError
  return created as HealthSettings
}
