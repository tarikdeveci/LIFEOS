import type { SupabaseClient } from '@supabase/supabase-js'
import { shiftIsoDate, todayDate } from '../utils/date'
import { profileFromPreferences } from '../utils/adaptiveTdee'
import {
  DEFAULT_HEALTH_SETTINGS,
  type HealthDaily,
  type HealthDailyInput,
  type HealthSettings,
  type HealthSettingsUpdate,
  type HealthSource,
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

/** Tek tartı: computeAdaptiveTdee'nin `weighIns` girdisiyle doğrudan uyumlu. */
export interface WeightPoint {
  date: string
  weightKg: number
  /** Geçmiş listesinde kaynağı göstermek ve yalnız elle girileni sildirmek için. */
  source: HealthSource
}

/** Son `days` günün kilo geçmişi, tarihe göre artan sıralı. */
export async function getWeightLogs(
  supabase: Supabase,
  userId: string,
  days = 90,
  endDate: string = todayDate(),
): Promise<WeightPoint[]> {
  const startDate = shiftIsoDate(endDate, -(days - 1))

  const { data, error } = await supabase
    .from('weight_logs')
    .select('date, weight_kg, source')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date')

  if (error) throw error
  return ((data ?? []) as WeightLog[]).map((row) => ({ date: row.date, weightKg: Number(row.weight_kg), source: row.source }))
}

export interface BodyProfile {
  /** En yeni tartı, yoksa profildeki kilo, o da yoksa null. */
  weightKg: number | null
  /** Anatomi figürü için; profilde yoksa null. */
  gender: 'male' | 'female' | null
}

/**
 * Kas analizinin vücut bilgisi: güncel kilo (vücut ağırlığı hareketlerinin
 * yükü) ve cinsiyet (kas haritası figürü). weight_logs okunamazsa profildeki
 * kiloya düşer.
 */
export async function getBodyProfile(supabase: Supabase, userId: string): Promise<BodyProfile> {
  const [latest, profile] = await Promise.all([
    supabase
      .from('weight_logs')
      .select('weight_kg')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('user_profiles').select('preferences').eq('id', userId).maybeSingle(),
  ])
  if (profile.error) throw profile.error

  const fromProfile = profileFromPreferences((profile.data as { preferences: unknown } | null)?.preferences)
  const logged = latest.error ? Number.NaN : Number((latest.data as { weight_kg: number } | null)?.weight_kg)
  return {
    weightKg: Number.isFinite(logged) && logged > 0 ? logged : fromProfile.weight_kg,
    gender: fromProfile.gender,
  }
}
