// Rutin domain types
// Şema: supabase/migrations/054_routines.sql → routines, routine_exceptions, routine_completions

import type { BlockType } from './planning'

/**
 * block: saatli takvim bloğu. task: o güne planlanan görev (saat verilirse bağlı blok da).
 * habit: "haftada N kez" esnek alışkanlık; örnek üretilmez, tamamlama işaretlenir.
 */
export type RoutineKind = 'block' | 'task' | 'habit'

/** 0=Pzr..6=Cmt (JS getDay ve Postgres DOW ile aynı). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface Routine {
  id: string
  user_id: string
  title: string
  kind: RoutineKind
  block_type: BlockType
  days_of_week: Weekday[]
  every_n_weeks: number        // 1-4
  times_per_week: number | null // sadece habit
  start_time: string | null     // 'HH:MM:SS'
  end_time: string | null
  estimated_minutes: number | null
  color: string | null
  value_score: number
  urgency_score: number
  risk_score: number
  effort_score: number
  friction_score: number
  starts_on: string             // 'YYYY-MM-DD'
  ends_on: string | null        // NULL = süresiz
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface RoutineCompletion {
  routine_id: string
  user_id: string
  completed_on: string
  created_at: string
}

export interface CreateRoutineInput {
  title: string
  kind: RoutineKind
  block_type?: BlockType
  days_of_week?: Weekday[]
  every_n_weeks?: number
  times_per_week?: number
  start_time?: string
  end_time?: string
  estimated_minutes?: number
  color?: string
  starts_on?: string
  ends_on?: string | null
}

export type UpdateRoutineInput = Partial<CreateRoutineInput> & { is_active?: boolean }

/** Tekrar kuralının üretim için gereken kısmı. */
export type RoutineSchedule = Pick<Routine, 'days_of_week' | 'every_n_weeks' | 'starts_on' | 'ends_on'>
