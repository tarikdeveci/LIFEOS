// Kullanıcı domain types

export type RolloverMode = 'carry' | 'backlog'

/** Kalıcı planlama kuralları (065). Sabah özeti, gece devri ve her AI çağrısı okur. */
export interface PlanningRules {
  /** Bir günde en çok kaç önemli zihinsel iş (1-5). */
  max_deep_tasks: number
  /** Kaçan görev: 'carry' bugüne taşınır, 'backlog' günden çıkar. */
  rollover: RolloverMode
  /** Bloklar arası tampon (dk). */
  buffer_minutes: number
  /** Kullanıcının kendi cümleleriyle kuralları; en çok 2000 karakter. */
  about: string
}

export const DEFAULT_PLANNING_RULES: PlanningRules = {
  max_deep_tasks: 3,
  rollover: 'carry',
  buffer_minutes: 15,
  about: '',
}

export const PLANNING_ABOUT_MAX = 2000

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system'
  morning_briefing_time: string // 'HH:MM'
  evening_summary_time: string  // 'HH:MM'
  daily_effort_limit: number    // WSJF efor toplamı limiti (default: 25)
  week_start: 'monday' | 'sunday'
  push_token?: string           // Expo push notification token
  planning?: Partial<PlanningRules>
}

export interface UserProfile {
  id: string // auth.users.id ile aynı
  display_name: string | null
  timezone: string // IANA timezone: 'Europe/Istanbul'
  preferences: UserPreferences
  created_at: string
  updated_at: string
}

export interface UpdateProfileInput {
  display_name?: string
  timezone?: string
  preferences?: Partial<UserPreferences>
}
