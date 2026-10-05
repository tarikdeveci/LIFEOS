// Hedef hiyerarşisi tipleri
// Şema: supabase/migrations/059_goals.sql → goals, tasks.goal_id

export type GoalHorizon = 'quarter' | 'month' | 'week'
export type GoalStatus = 'active' | 'done' | 'dropped'
export type GoalCountMode = 'tasks' | 'hours'

export interface Goal {
  id: string
  user_id: string
  /** Bir üst ufuktaki hedef (hafta → ay → çeyrek). */
  parent_id: string | null
  horizon: GoalHorizon
  title: string
  icon: string | null
  /** Periyodun ilk günü, 'YYYY-MM-DD' (hafta: Pazartesi). */
  period_start: string
  /** Sayılabilir hedef (çoğunlukla haftalık); NULL = oranla ölçülür. */
  target: number | null
  unit: string | null
  count_mode: GoalCountMode | null
  tag_filter: string[]
  /** 065: bu hedefe bağlı işlerden bir günde en çok kaçı öncelik olabilir. NULL = sınırsız. */
  daily_cap: number | null
  status: GoalStatus
  review_note: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface CreateGoalInput {
  horizon: GoalHorizon
  title: string
  period_start: string
  parent_id?: string | null
  icon?: string | null
  target?: number | null
  unit?: string | null
  count_mode?: GoalCountMode | null
  tag_filter?: string[]
  daily_cap?: number | null
}

export type UpdateGoalInput = Partial<Omit<CreateGoalInput, 'horizon'>> & {
  status?: GoalStatus
  review_note?: string | null
  reviewed_at?: string | null
}

/** İlerleme hesabına giren görevin asgari alanları. */
export interface GoalTaskLike {
  goal_id: string | null
  status: string
  tags: string[] | null
  estimated_minutes: number | null
  scheduled_date: string | null
  completed_at: string | null
}

export interface GoalProgressInfo {
  current: number
  /** Hedef sayısı; oran modunda toplam öğe sayısı. */
  total: number
  /** 0-100 */
  pct: number
}
