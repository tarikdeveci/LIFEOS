import type { SupabaseClient } from '@supabase/supabase-js'
import {
  BLOCK_REMINDER_CHOICES,
  DEFAULT_EMAIL_PREFERENCES,
  DEFAULT_PUSH_PREFERENCES,
  type BlockReminderMinutes,
  type EmailPreferences,
  type EmailPreferencesUpdate,
  type PushPreferences,
  type PushPreferencesUpdate,
} from '../types/notifications'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any>

/**
 * Kolon adları ile arayüz adları arasındaki köprü.
 *
 * Sunucudaki kolon adı `digest_*` ama kullanıcıya "sabah" diyoruz; 023
 * migration'ı öğlen/akşam slotlarını eklerken sabahı olduğu yerde bıraktı,
 * yani `digest_hour` aslında "sabah saati". Bu eşlemeyi tek yerde tutmak,
 * ekranda `digest_hour` gibi bir alan görünmesini engelliyor.
 */
const PUSH_COLUMNS = {
  morning_enabled: 'digest_enabled',
  morning_hour: 'digest_hour',
  midday_enabled: 'midday_enabled',
  midday_hour: 'midday_hour',
  evening_enabled: 'evening_enabled',
  evening_hour: 'evening_hour',
  weight_enabled: 'weight_enabled',
  weight_hour: 'weight_hour',
  block_reminder_enabled: 'block_reminder_enabled',
  block_reminder_minutes: 'block_reminder_minutes',
} as const

function asHour(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(23, Math.max(0, Math.round(n)))
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** Şemadaki CHECK yalnızca 5/15/30/60 kabul ediyor; başka değer 23514 ile döner. */
function asReminderMinutes(value: unknown): BlockReminderMinutes {
  const n = typeof value === 'number' ? value : Number(value)
  return (BLOCK_REMINDER_CHOICES as readonly number[]).includes(n)
    ? (n as BlockReminderMinutes)
    : DEFAULT_PUSH_PREFERENCES.block_reminder_minutes
}

/**
 * Push tercihlerini okur.
 *
 * Satır yoksa varsayılan döner: kayıt trigger'ı (022/027) satırı normalde
 * açıyor ama trigger'dan önce açılmış hesaplarda satır olmayabiliyor. Bu
 * durumda ekranın boş açılmasındansa varsayılanı göstermek doğru — ilk
 * kaydetme zaten upsert ile satırı oluşturuyor.
 */
export async function getPushPreferences(
  supabase: Supabase,
  userId: string,
): Promise<PushPreferences> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select(
      'digest_enabled, digest_hour, midday_enabled, midday_hour, evening_enabled, evening_hour, weight_enabled, weight_hour, block_reminder_enabled, block_reminder_minutes, timezone',
    )
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error

  const row = (data ?? {}) as Record<string, unknown>
  return {
    morning_enabled: asBool(row['digest_enabled'], DEFAULT_PUSH_PREFERENCES.morning_enabled),
    morning_hour: asHour(row['digest_hour'], DEFAULT_PUSH_PREFERENCES.morning_hour),
    midday_enabled: asBool(row['midday_enabled'], DEFAULT_PUSH_PREFERENCES.midday_enabled),
    midday_hour: asHour(row['midday_hour'], DEFAULT_PUSH_PREFERENCES.midday_hour),
    evening_enabled: asBool(row['evening_enabled'], DEFAULT_PUSH_PREFERENCES.evening_enabled),
    evening_hour: asHour(row['evening_hour'], DEFAULT_PUSH_PREFERENCES.evening_hour),
    weight_enabled: asBool(row['weight_enabled'], DEFAULT_PUSH_PREFERENCES.weight_enabled),
    weight_hour: asHour(row['weight_hour'], DEFAULT_PUSH_PREFERENCES.weight_hour),
    block_reminder_enabled: asBool(
      row['block_reminder_enabled'],
      DEFAULT_PUSH_PREFERENCES.block_reminder_enabled,
    ),
    block_reminder_minutes: asReminderMinutes(row['block_reminder_minutes']),
    timezone: typeof row['timezone'] === 'string' ? row['timezone'] : 'Europe/Istanbul',
  }
}

/**
 * Push tercihlerini yazar.
 *
 * upsert, çünkü satırın var olduğu garanti değil (yukarıdaki nota bakınız).
 * timezone'a DOKUNMUYOR: onu cihaz, token kaydı sırasında güncelliyor
 * (notifications/setup.ts → syncTimezone). Buradan da yazmak, iki kaynağın
 * birbirini ezmesi demek olurdu.
 */
export async function updatePushPreferences(
  supabase: Supabase,
  userId: string,
  patch: PushPreferencesUpdate,
): Promise<void> {
  const row: Record<string, unknown> = { user_id: userId }
  for (const [key, column] of Object.entries(PUSH_COLUMNS)) {
    const value = patch[key as keyof PushPreferencesUpdate]
    if (value !== undefined) row[column] = value
  }
  if (Object.keys(row).length === 1) return

  const { error } = await supabase
    .from('notification_preferences')
    .upsert(row, { onConflict: 'user_id' })

  if (error) throw error
}

/**
 * E-posta tercihleri user_profiles.preferences JSONB'sinde duruyor —
 * send-email tam olarak bu anahtarları okuyor, uydurma yok:
 *   email_morning_enabled / morning_briefing_time
 *   email_evening_enabled / evening_summary_time
 */
export async function getEmailPreferences(
  supabase: Supabase,
  userId: string,
): Promise<EmailPreferences> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('preferences')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error

  const prefs = (data?.preferences ?? {}) as Record<string, unknown>
  const time = (value: unknown, fallback: string): string =>
    typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) ? value : fallback

  return {
    morning_enabled: asBool(prefs['email_morning_enabled'], DEFAULT_EMAIL_PREFERENCES.morning_enabled),
    morning_time: time(prefs['morning_briefing_time'], DEFAULT_EMAIL_PREFERENCES.morning_time),
    evening_enabled: asBool(prefs['email_evening_enabled'], DEFAULT_EMAIL_PREFERENCES.evening_enabled),
    evening_time: time(prefs['evening_summary_time'], DEFAULT_EMAIL_PREFERENCES.evening_time),
  }
}

/**
 * E-posta tercihlerini yazar.
 *
 * JSONB'nin TAMAMINI okuyup üzerine yazıyoruz: preferences içinde tema, boy,
 * kilo, hedef gibi ilgisiz alanlar da var ve düz bir update onları siler.
 * Web ayarlar sayfası da aynı nesneyi yazıyor; iki istemcinin birbirinin
 * alanını silmemesi için okuma-birleştirme-yazma şart.
 */
export async function updateEmailPreferences(
  supabase: Supabase,
  userId: string,
  patch: EmailPreferencesUpdate,
): Promise<void> {
  const { data, error: readError } = await supabase
    .from('user_profiles')
    .select('preferences')
    .eq('id', userId)
    .maybeSingle()

  if (readError) throw readError

  const current = (data?.preferences ?? {}) as Record<string, unknown>
  const next = { ...current }

  if (patch.morning_enabled !== undefined) next['email_morning_enabled'] = patch.morning_enabled
  if (patch.morning_time !== undefined) next['morning_briefing_time'] = patch.morning_time
  if (patch.evening_enabled !== undefined) next['email_evening_enabled'] = patch.evening_enabled
  if (patch.evening_time !== undefined) next['evening_summary_time'] = patch.evening_time

  const { error } = await supabase
    .from('user_profiles')
    .update({ preferences: next })
    .eq('id', userId)

  if (error) throw error
}
