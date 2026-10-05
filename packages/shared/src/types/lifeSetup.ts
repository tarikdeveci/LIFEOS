// AI kurulum önerisi: kullanıcının serbest metinle yazdığı hayat planından çıkarılır,
// tek onay ekranında gösterilir, mevcut rutin/hedef/görev fonksiyonlarıyla uygulanır.
// Sunucu: supabase/functions/ai-suggest (type: 'life_setup').

import type { GoalCountMode, GoalHorizon } from './goal'
import type { BlockType, LifeArea } from './planning'
import type { RoutineKind, Weekday } from './routine'
import type { PlanningRules } from './user'

export const LIFE_SETUP_TEXT_MAX = 8000

export interface SetupRoutine {
  title: string
  kind: RoutineKind
  area: LifeArea | null
  block_type?: BlockType
  days_of_week?: Weekday[]
  times_per_week?: number
  times_per_day?: number
  /** 'HH:MM' */
  start_time?: string
  end_time?: string
  estimated_minutes?: number
  min_minutes?: number
  target_count?: number
  start_count?: number
  is_protected?: boolean
  is_untracked?: boolean
}

export interface SetupGoal {
  title: string
  horizon: GoalHorizon
  target?: number
  unit?: string
  count_mode?: GoalCountMode
  daily_cap?: number
  /** Sıralı adımlar; her biri hedefe bağlı backlog görevi olur. */
  steps?: string[]
}

export interface SetupTask {
  title: string
  area: LifeArea | null
  estimated_minutes?: number
}

export interface LifeSetupProposal {
  summary: string
  routines: SetupRoutine[]
  goals: SetupGoal[]
  tasks: SetupTask[]
  rules: Partial<PlanningRules>
  /** Uygulamanın karşılayamadığı istekler; kullanıcıya olduğu gibi gösterilir. */
  unsupported: string[]
}
