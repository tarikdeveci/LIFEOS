// Bildirim tercihleri domain types
// Şema: supabase/migrations/019, 023 (öğlen/akşam slotları), 027 (timezone), 051 (kilo)
//
// DİKKAT — tercihler İKİ ayrı yerde duruyor ve bu bilinçli değil, tarihsel:
//
//   push  → notification_preferences tablosu (kolonlar)
//   email → user_profiles.preferences JSONB (anahtarlar)
//
// Sunucu tarafı bu ikisini farklı yerlerden okuyor: daily-digest ve
// event-notifications tabloyu, send-email ise JSONB'yi. Arayüzün ikisini de
// aynı ekranda göstermesi gerekiyor ama yazarken doğru yere yazmalı — bu
// yüzden iki ayrı tip var ve tek bir "hepsi bir arada" tipi YOK. Tek tipe
// indirgemek, hangi alanın nereye gittiğini kodda görünmez yapardı.

/** Sunucunun daily-digest / event-notifications için okuduğu push tercihleri. */
export interface PushPreferences {
  /** Sabah özeti (sunucuda digest_* olarak geçer). */
  morning_enabled: boolean
  morning_hour: number
  midday_enabled: boolean
  midday_hour: number
  evening_enabled: boolean
  evening_hour: number
  /** Sabah tartı hatırlatması; o gün tartı varsa gönderilmez (051). */
  weight_enabled: boolean
  weight_hour: number
  /** Yaklaşan zaman bloğu hatırlatması. */
  block_reminder_enabled: boolean
  /** Şema CHECK'i yalnızca bu dört değeri kabul eder. */
  block_reminder_minutes: BlockReminderMinutes
  /** IANA saat dilimi. Tüm saat hesapları buna göre yapılır. */
  timezone: string
}

export const BLOCK_REMINDER_CHOICES = [5, 15, 30, 60] as const
export type BlockReminderMinutes = (typeof BLOCK_REMINDER_CHOICES)[number]

/** send-email'in user_profiles.preferences içinden okuduğu e-posta tercihleri. */
export interface EmailPreferences {
  morning_enabled: boolean
  /** 'HH:MM' — send-email yalnızca saat kısmını kullanır. */
  morning_time: string
  evening_enabled: boolean
  evening_time: string
}

export const DEFAULT_PUSH_PREFERENCES: Omit<PushPreferences, 'timezone'> = {
  morning_enabled: true,
  morning_hour: 8,
  midday_enabled: true,
  midday_hour: 13,
  evening_enabled: true,
  evening_hour: 21,
  weight_enabled: true,
  weight_hour: 8,
  block_reminder_enabled: true,
  block_reminder_minutes: 15,
}

export const DEFAULT_EMAIL_PREFERENCES: EmailPreferences = {
  morning_enabled: false,
  morning_time: '08:00',
  evening_enabled: false,
  evening_time: '21:00',
}

export type PushPreferencesUpdate = Partial<Omit<PushPreferences, 'timezone'>>
export type EmailPreferencesUpdate = Partial<EmailPreferences>
