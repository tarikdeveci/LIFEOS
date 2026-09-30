import type { SupabaseClient } from '@supabase/supabase-js'
import type { CreateGoalInput, Goal, GoalTaskLike, UpdateGoalInput } from '../types/goal'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any>

const GOAL_TASK_COLUMNS = 'id, goal_id, status, tags, estimated_minutes, scheduled_date, completed_at'

export type GoalTask = GoalTaskLike & { id: string }

/** period_start >= since olan hedefler (değerlendirme için geçen çeyrekten başlatın). */
export async function getGoals(supabase: Supabase, userId: string, since: string): Promise<Goal[]> {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .gte('period_start', since)
    .order('period_start')
    .order('created_at')

  if (error) throw error
  return data as unknown as Goal[]
}

/**
 * İlerleme hesabı için görevler: hedefe bağlı olanların hepsi ve [from, to] içinde
 * tamamlanmış olanlar (etiketle eşleşen haftalık hedefler için).
 */
export async function getGoalTasks(
  supabase: Supabase,
  userId: string,
  from: string,
  to: string,
): Promise<GoalTask[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(GOAL_TASK_COLUMNS)
    .eq('user_id', userId)
    .or(`goal_id.not.is.null,and(status.eq.done,scheduled_date.gte.${from},scheduled_date.lte.${to})`)

  if (error) throw error
  return data as unknown as GoalTask[]
}

export async function createGoals(
  supabase: Supabase,
  userId: string,
  inputs: CreateGoalInput[],
): Promise<Goal[]> {
  if (inputs.length === 0) return []
  const { data, error } = await supabase
    .from('goals')
    .insert(inputs.map((input) => ({ ...input, user_id: userId })))
    .select()

  if (error) throw error
  return data as unknown as Goal[]
}

export async function createGoal(supabase: Supabase, userId: string, input: CreateGoalInput): Promise<Goal> {
  const [goal] = await createGoals(supabase, userId, [input])
  if (!goal) throw new Error('goal insert returned no row')
  return goal
}

export async function updateGoal(supabase: Supabase, goalId: string, input: UpdateGoalInput): Promise<Goal> {
  const { data, error } = await supabase
    .from('goals')
    .update(input)
    .eq('id', goalId)
    .select()
    .single()

  if (error) throw error
  return data as unknown as Goal
}

/** Alt hedeflerin ve görevlerin bağı kopar (ON DELETE SET NULL); kendileri silinmez. */
export async function deleteGoal(supabase: Supabase, goalId: string): Promise<void> {
  const { error } = await supabase.from('goals').delete().eq('id', goalId)
  if (error) throw error
}
