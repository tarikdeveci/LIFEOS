// Gün raporu tipleri
// Şema: supabase/migrations/065_daily_loop.sql → daily_reports
// "export type DayOutcome" satırından sonrası supabase/functions/_shared/report/types.ts
// ile birebir aynı tutulur (tests/shared/dailyBrief.test.ts doğrular).

import type { LifeArea } from './planning'

export type DayOutcome = 'done' | 'partial' | 'skipped' | 'open'
export type SkipReason = 'energy' | 'time' | 'interrupted' | 'not_needed' | 'avoided'
export type DayItemKind = 'task' | 'block' | 'habit'

export interface DayItem {
  /** 'task:<id>' | 'block:<id>' | 'habit:<rutin id>' */
  key: string
  kind: DayItemKind
  title: string
  area: LifeArea | null
  minutes: number | null
  /** 'HH:MM'; saatsiz işte NULL. */
  start_time: string | null
  /** Bugün yapılması bekleniyordu; haftalık esnek alışkanlıkta false. */
  expected: boolean
  outcome: DayOutcome
  reason: SkipReason | null
  /** Sayaçlı rutin örneğinde program ilerlemesi (ör. 7/42). */
  program: { done: number; target: number } | null
}

export interface DayMovement {
  exercise_minutes: number | null
  steps: number | null
  workout_done: boolean
}

export interface DayNutrition {
  calories: number
  calorie_target: number | null
  protein_g: number
  meals: number
}

export interface HabitWeek {
  routine_id: string
  title: string
  done: number
  target: number
}

/** Günün anlık görüntüsü; sunucuda hesaplanır (_shared/report/facts.ts). */
export interface DayFacts {
  date: string
  /** daily_plans.energy_level (1-5). */
  energy: number | null
  items: DayItem[]
  focus_minutes: number
  movement: DayMovement
  nutrition: DayNutrition | null
  /** Sayaçsız (is_untracked) alışkanlıklar burada yer almaz. */
  habits_week: HabitWeek[]
  generated_at: string
}

/** Kullanıcının kapanış işaretleri. "Yaptım" buraya yazılmaz, gerçek tamamlama olur. */
export interface DayCheckin {
  items?: Record<string, { outcome: 'partial' | 'skipped'; reason?: SkipReason }>
  note?: string
  closed_at?: string
}

export interface DayNarrative {
  source: 'template' | 'ai'
  headline: string
  went_well: string[]
  postponed: { title: string; note: string }[]
  /** Yarını kolaylaştıracak tek öneri. */
  suggestion: string
  /** "Gelecekteki kendin için ne yaptın" cümlesi. */
  future_self: string
}

export interface DailyReport {
  user_id: string
  date: string
  facts: DayFacts
  checkin: DayCheckin
  narrative: DayNarrative | null
  opened_at: string | null
  created_at: string
  updated_at: string
}
