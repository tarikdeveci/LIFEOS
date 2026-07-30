// Sağlık verisi domain types (Apple Health / Health Connect)
// Şema: supabase/migrations/028_health_metrics.sql

export type HealthSource = 'apple_health' | 'health_connect' | 'manual'

/**
 * Bir günün sağlık özeti. Her metrik `null` olabilir — cihaz o veriyi
 * üretmiyorsa (ör. saat takılmadıysa nabız/uyku) 0 değil null yazılır.
 */
export interface HealthDaily {
  user_id: string
  date: string // 'YYYY-MM-DD'

  steps: number | null
  distance_m: number | null
  active_energy_kcal: number | null
  exercise_minutes: number | null
  workout_count: number | null

  sleep_minutes: number | null
  sleep_start: string | null
  sleep_end: string | null

  resting_heart_rate: number | null
  avg_heart_rate: number | null

  source: HealthSource
  synced_at: string
  created_at: string
  updated_at: string
}

/** Cihazdan okunup DB'ye yazılacak ham özet (server tarafı alanlar hariç) */
export interface HealthDailyInput {
  date: string
  steps?: number | null
  distance_m?: number | null
  active_energy_kcal?: number | null
  exercise_minutes?: number | null
  workout_count?: number | null
  sleep_minutes?: number | null
  sleep_start?: string | null
  sleep_end?: string | null
  resting_heart_rate?: number | null
  avg_heart_rate?: number | null
  source: HealthSource
}

export interface HealthSettings {
  user_id: string
  enabled: boolean
  step_goal: number
  sleep_goal_minutes: number
  add_active_energy_to_budget: boolean
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export type HealthSettingsUpdate = Partial<
  Pick<HealthSettings, 'enabled' | 'step_goal' | 'sleep_goal_minutes' | 'add_active_energy_to_budget' | 'last_synced_at'>
>

export const DEFAULT_HEALTH_SETTINGS = {
  enabled: false,
  step_goal: 8000,
  sleep_goal_minutes: 450,
  add_active_energy_to_budget: false,
} as const
