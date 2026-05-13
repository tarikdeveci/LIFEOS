// Kullanıcı domain types

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system'
  morning_briefing_time: string // 'HH:MM'
  evening_summary_time: string  // 'HH:MM'
  daily_effort_limit: number    // WSJF efor toplamı limiti (default: 25)
  week_start: 'monday' | 'sunday'
  push_token?: string           // Expo push notification token
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
