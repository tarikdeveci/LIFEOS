// Rutin domain types
// Şema: supabase/migrations/054_routines.sql → routines, routine_exceptions, routine_completions

import type { BlockType, LifeArea } from './planning'

/**
 * block: saatli takvim bloğu. task: o güne planlanan görev (saat verilirse bağlı blok da).
 * habit: esnek alışkanlık; örnek üretilmez, tamamlama işaretlenir. Hedef "haftada N gün"
 * ya da "günde N kez" (times_per_day).
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
  times_per_day: number | null  // sadece habit; NULL = günde tek işaret
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
  /** 065: yaşam alanı; NULL = sınıflanmamış. */
  area: LifeArea | null
  /** Program uzunluğu ("42 oturum"); dolunca seri kendiliğinden biter. NULL = süresiz. */
  target_count: number | null
  /** Rutin kurulmadan önce bitmiş oturum sayısı. */
  start_count: number
  /** Düşük enerji günü için asgari süre (dk). */
  min_minutes: number | null
  /** AI planlayıcı bu rutinin bloklarını taşıyamaz, silemez. */
  is_protected: boolean
  /** Seri, sayaç ve hatırlatma gösterilmez (maneviyat gibi ölçülmeyecek işler). */
  is_untracked: boolean
  /** 068: bağlı hedef (yalnızca task ve habit). Görev örnekleri ve alışkanlık günleri ilerlemeye sayılır. */
  goal_id: string | null
  created_at: string
  updated_at: string
}

export interface RoutineCompletion {
  routine_id: string
  user_id: string
  completed_on: string
  /** O günkü işaret sayısı (günde N kez alışkanlıkta sayaç). */
  count: number
  created_at: string
}

export interface CreateRoutineInput {
  title: string
  kind: RoutineKind
  block_type?: BlockType
  days_of_week?: Weekday[]
  every_n_weeks?: number
  times_per_week?: number
  times_per_day?: number | null
  start_time?: string
  end_time?: string
  estimated_minutes?: number
  color?: string
  starts_on?: string
  ends_on?: string | null
  area?: LifeArea | null
  target_count?: number | null
  start_count?: number
  min_minutes?: number | null
  is_protected?: boolean
  is_untracked?: boolean
  goal_id?: string | null
}

/** my_routine_progress RPC satırı: sayaçlı rutinin biten oturum sayısı. */
export interface RoutineProgress {
  routine_id: string
  done_count: number
}

export type UpdateRoutineInput = Partial<CreateRoutineInput> & { is_active?: boolean }

/** Tekrar kuralının üretim için gereken kısmı. */
export type RoutineSchedule = Pick<Routine, 'days_of_week' | 'every_n_weeks' | 'starts_on' | 'ends_on'>
