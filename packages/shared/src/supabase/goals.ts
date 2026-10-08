import type { SupabaseClient } from '@supabase/supabase-js'
import type { CreateGoalEntryInput, CreateGoalInput, Goal, GoalEntry, GoalTaskLike, HabitGoalDay, UpdateGoalInput } from '../types/goal'
import { fromDateString, shiftIsoDate } from '../utils/date'

type Supabase = SupabaseClient

const GOAL_TASK_COLUMNS = 'id, title, goal_id, status, tags, estimated_minutes, scheduled_date, completed_at'

/** Başlık, hedefin adım listesi için. */
export type GoalTask = GoalTaskLike & { id: string; title: string }

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
 * tamamlanmış olanlar (etiketle eşleşen hedefler için). Planlanmamış görev, tamamlandığı
 * an yerel [from, to] günlerine düşüyorsa gelir.
 */
export async function getGoalTasks(
  supabase: Supabase,
  userId: string,
  from: string,
  to: string,
): Promise<GoalTask[]> {
  const doneFrom = fromDateString(from).toISOString()
  const doneTo = fromDateString(shiftIsoDate(to, 1)).toISOString()
  const { data, error } = await supabase
    .from('tasks')
    .select(GOAL_TASK_COLUMNS)
    .eq('user_id', userId)
    .or([
      'goal_id.not.is.null',
      `and(status.eq.done,scheduled_date.gte.${from},scheduled_date.lte.${to})`,
      `and(status.eq.done,scheduled_date.is.null,completed_at.gte."${doneFrom}",completed_at.lt."${doneTo}")`,
    ].join(','))
    // Adım listesi eklenme sırasıyla dursun: tik atınca satırlar yer değiştirmesin.
    .order('created_at')

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

export async function getGoalEntries(
  supabase: Supabase, userId: string, since: string, until: string,
): Promise<GoalEntry[]> {
  const { data, error } = await supabase.from('goal_entries').select('*')
    .eq('user_id', userId).gte('entry_date', since).lte('entry_date', until)
    .order('entry_date', { ascending: false }).order('created_at', { ascending: false })
  if (error) throw error
  if (!data) throw new Error('goal entries returned no data')
  return data as GoalEntry[]
}

export async function createGoalEntry(
  supabase: Supabase, userId: string, input: CreateGoalEntryInput,
): Promise<GoalEntry> {
  const { data, error } = await supabase.from('goal_entries')
    .insert({ ...input, user_id: userId }).select().single()
  if (error) throw error
  if (!data) throw new Error('goal entry insert returned no row')
  return data as GoalEntry
}

export async function deleteGoalEntry(supabase: Supabase, entryId: string): Promise<void> {
  const { error } = await supabase.from('goal_entries').delete().eq('id', entryId)
  if (error) throw error
}

/** Hedefe bağlı alışkanlıkların [since, until] içindeki tamamlama günleri. */
export async function getHabitGoalDays(
  supabase: Supabase, userId: string, since: string, until: string,
): Promise<HabitGoalDay[]> {
  const { data: routines, error } = await supabase.from('routines').select('id, goal_id, times_per_day')
    .eq('user_id', userId).eq('kind', 'habit').not('goal_id', 'is', null)
  if (error) throw error
  const linked = (routines ?? []) as { id: string; goal_id: string; times_per_day: number | null }[]
  if (linked.length === 0) return []
  const byId = new Map(linked.map((r) => [r.id, r]))
  const { data, error: completionsError } = await supabase.from('routine_completions')
    .select('routine_id, completed_on, count')
    .in('routine_id', [...byId.keys()]).gte('completed_on', since).lte('completed_on', until)
  if (completionsError) throw completionsError
  return ((data ?? []) as { routine_id: string; completed_on: string; count: number }[]).flatMap((c) => {
    const routine = byId.get(c.routine_id)
    return routine ? [{
      routine_id: c.routine_id, goal_id: routine.goal_id, user_id: userId,
      completed_on: c.completed_on, count: c.count, times_per_day: routine.times_per_day,
    }] : []
  })
}
