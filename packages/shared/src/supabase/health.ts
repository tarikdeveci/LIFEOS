import type { SupabaseClient } from '@supabase/supabase-js'
import { shiftIsoDate, todayDate } from '../utils/date'
import { profileFromPreferences } from '../utils/adaptiveTdee'
import {
  DEFAULT_HEALTH_SETTINGS,
  type HealthDaily,
  type HealthDailyInput,
  type HealthSettings,
  type HealthSettingsUpdate,
  type WeightLog,
  type WeightLogInput,
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

// -------------------------------------------------------
// Kilo geçmişi: adaptif kalori hedefinin girdisi (bkz. utils/adaptiveTdee.ts)
// -------------------------------------------------------

/** weight_logs.weight_kg CHECK aralığı (049). */
export const WEIGHT_LOG_MIN_KG = 20
export const WEIGHT_LOG_MAX_KG = 400

/**
 * Bir günün kilosunu yazar/düzeltir. Aynı gün tekrar yazılırsa üzerine yazılır,
 * tek istisna: cihaz senkronu o günün elle girilmiş kaydını ezmez. Kullanıcı
 * tartıyı düzelttiyse bir sonraki Apple Health/Health Connect okuması onu geri
 * almamalı.
 */
export async function upsertWeightLog(
  supabase: Supabase,
  userId: string,
  input: WeightLogInput,
): Promise<void> {
  if (!Number.isFinite(input.weight_kg) || input.weight_kg < WEIGHT_LOG_MIN_KG || input.weight_kg > WEIGHT_LOG_MAX_KG) {
    throw new RangeError(`Kilo ${WEIGHT_LOG_MIN_KG}-${WEIGHT_LOG_MAX_KG} kg aralığında olmalı`)
  }

  if (input.source !== 'manual') {
    const { data: existing, error: readError } = await supabase
      .from('weight_logs')
      .select('source')
      .eq('user_id', userId)
      .eq('date', input.date)
      .maybeSingle()
    if (readError) throw readError
    if ((existing as { source: string } | null)?.source === 'manual') return
  }

  const { error } = await supabase
    .from('weight_logs')
    .upsert(
      {
        user_id: userId,
        date: input.date,
        weight_kg: input.weight_kg,
        source: input.source,
        synced_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,date' },
    )

  if (error) throw error
}

/** Bir günün kilo kaydını siler (yanlış girilen manuel kayıt için). */
export async function deleteWeightLog(supabase: Supabase, userId: string, date: string): Promise<void> {
  const { error } = await supabase
    .from('weight_logs')
    .delete()
    .eq('user_id', userId)
    .eq('date', date)

  if (error) throw error
}

/**
 * Son `days` günün kilo geçmişi, tarihe göre artan sıralı. computeAdaptiveTdee'nin
 * `weighIns` girdisiyle doğrudan uyumlu olsun diye `date`/`weightKg` alanlarıyla döner.
 */
export async function getWeightLogs(
  supabase: Supabase,
  userId: string,
  days = 90,
  endDate: string = todayDate(),
): Promise<Array<{ date: string; weightKg: number }>> {
  const startDate = shiftIsoDate(endDate, -(days - 1))

  const { data, error } = await supabase
    .from('weight_logs')
    .select('date, weight_kg')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date')

  if (error) throw error
  return ((data ?? []) as WeightLog[]).map((row) => ({ date: row.date, weightKg: Number(row.weight_kg) }))
}

/**
 * Güncel vücut ağırlığı: en yeni tartı, yoksa profildeki kilo, o da yoksa null.
 * weight_logs okunamazsa (049 henüz uygulanmadıysa) profile düşer.
 */
export async function getLatestBodyWeightKg(supabase: Supabase, userId: string): Promise<number | null> {
  const { data: latest, error: logError } = await supabase
    .from('weight_logs')
    .select('weight_kg')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  const logged = logError ? null : Number((latest as { weight_kg: number } | null)?.weight_kg)
  if (logged !== null && Number.isFinite(logged) && logged > 0) return logged

  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('preferences')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return profileFromPreferences((profile as { preferences: unknown } | null)?.preferences).weight_kg
}
