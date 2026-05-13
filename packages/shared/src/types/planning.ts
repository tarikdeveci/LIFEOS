// Zaman planlama domain types
// Şema: supabase/migrations/001_core_schema.sql → time_blocks, daily_plans

export type BlockType = 'task' | 'routine' | 'break' | 'focus' | 'meal' | 'workout'
export type RecurrenceType = 'daily' | 'weekly' | 'biweekly' | 'monthly'

export interface TimeBlock {
  id: string
  user_id: string
  task_id: string | null

  date: string      // 'YYYY-MM-DD'
  start_time: string // 'HH:MM'
  end_time: string   // 'HH:MM'

  block_type: BlockType
  label: string | null
  color: string | null

  is_recurring: boolean
  recurrence_type: RecurrenceType | null
  recurrence_days: number[] | null  // 0=Pzr..6=Cmt
  recurrence_end: string | null     // 'YYYY-MM-DD'

  created_at: string
  updated_at: string
}

export interface DailyPlan {
  id: string
  user_id: string
  date: string
  energy_level: 1 | 2 | 3 | 4 | 5 | null
  notes: string | null
  ai_suggestions: AiSuggestion[]
  created_at: string
  updated_at: string
}

export interface AiSuggestion {
  type: 'task_order' | 'break' | 'focus_block' | 'general'
  message: string
  task_id?: string
  suggested_start?: string  // 'HH:MM'
  suggested_end?: string    // 'HH:MM'
  block_type?: BlockType
}

export interface CreateTimeBlockInput {
  task_id?: string
  date: string
  start_time: string
  end_time: string
  block_type?: BlockType
  label?: string
  color?: string
  is_recurring?: boolean
  recurrence_type?: RecurrenceType
  recurrence_days?: number[]
  recurrence_end?: string
}

export type UpdateTimeBlockInput = Partial<CreateTimeBlockInput>

export interface DayStats {
  total_tasks: number
  completed_tasks: number
  total_effort: number
  total_minutes_planned: number
  energy_level: DailyPlan['energy_level']
}

export interface WeeklyDayStat {
  date: string
  dayLabel: string
  tasksTotal: number
  tasksCompleted: number
  taskPercent: number
  calories: number
  caloriePercent: number
  workoutStatus: 'completed' | 'skipped' | 'in_progress' | 'none'
  caloriesBurned: number
}
