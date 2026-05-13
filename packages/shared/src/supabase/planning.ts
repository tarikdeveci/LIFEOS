import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'
import type {
  TimeBlock,
  DailyPlan,
  AiSuggestion,
  CreateTimeBlockInput,
  UpdateTimeBlockInput,
} from '../types/planning'
import type { Task } from '../types/task'
import { todayDate } from '../utils/date'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any>
type TimeBlockInsert = Database['public']['Tables']['time_blocks']['Insert']
type TimeBlockUpdate = Database['public']['Tables']['time_blocks']['Update']
type DailyPlanInsert = Database['public']['Tables']['daily_plans']['Insert']
type DailyPlanUpdate = Database['public']['Tables']['daily_plans']['Update']

export async function getTimeBlocks(
  supabase: Supabase,
  userId: string,
  date: string,
): Promise<TimeBlock[]> {
  const { data, error } = await supabase
    .from('time_blocks')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .order('start_time')

  if (error) throw error
  return data as unknown as TimeBlock[]
}

export async function createTimeBlock(
  supabase: Supabase,
  userId: string,
  input: CreateTimeBlockInput,
): Promise<TimeBlock> {
  const payload = {
    user_id: userId,
    task_id: input.task_id ?? null,
    date: input.date,
    start_time: input.start_time,
    end_time: input.end_time,
    block_type: input.block_type ?? 'task',
    label: input.label ?? null,
    color: input.color ?? null,
    is_recurring: input.is_recurring ?? false,
    recurrence_type: input.recurrence_type ?? null,
    recurrence_days: input.recurrence_days ?? null,
    recurrence_end: input.recurrence_end ?? null,
  } as TimeBlockInsert

  const { data, error } = await supabase
    .from('time_blocks')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return data as unknown as TimeBlock
}

export async function updateTimeBlock(
  supabase: Supabase,
  blockId: string,
  updates: UpdateTimeBlockInput,
): Promise<TimeBlock> {
  const { data, error } = await supabase
    .from('time_blocks')
    .update(updates as TimeBlockUpdate)
    .eq('id', blockId)
    .select()
    .single()

  if (error) throw error
  return data as unknown as TimeBlock
}

export async function deleteTimeBlock(supabase: Supabase, blockId: string): Promise<void> {
  const { error } = await supabase.from('time_blocks').delete().eq('id', blockId)
  if (error) throw error
}

export async function getDailyPlan(
  supabase: Supabase,
  userId: string,
  date: string,
): Promise<DailyPlan> {
  const { data: existing } = await supabase
    .from('daily_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle()

  if (existing) return existing as unknown as DailyPlan

  // Kayıt yoksa oluştur
  const { data, error } = await supabase
    .from('daily_plans')
    .insert({ user_id: userId, date } as DailyPlanInsert)
    .select()
    .single()

  if (error) throw error
  return data as unknown as DailyPlan
}

export async function updateDailyPlan(
  supabase: Supabase,
  planId: string,
  updates: { energy_level?: number; notes?: string; ai_suggestions?: AiSuggestion[] },
): Promise<DailyPlan> {
  const { data, error } = await supabase
    .from('daily_plans')
    .update(updates as DailyPlanUpdate)
    .eq('id', planId)
    .select()
    .single()

  if (error) throw error
  return data as unknown as DailyPlan
}

// Güne atanmış ama time block'a bağlanmamış görevler (esnek havuz)
export async function getFlexTasks(
  supabase: Supabase,
  userId: string,
  date: string,
): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('scheduled_date', date)
    .eq('is_time_blocked', false)
    .not('status', 'in', '(done,deferred)')
    .order('priority_score', { ascending: false })

  if (error) throw error
  return data as unknown as Task[]
}

// Görevi güne ata
export async function assignTaskToDate(
  supabase: Supabase,
  taskId: string,
  date: string,
): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update({ scheduled_date: date, status: 'planned' })
    .eq('id', taskId)

  if (error) throw error
}

// Tarih aralığı için bloklar (haftalık/aylık görünüm)
export async function getBlocksForDateRange(
  supabase: Supabase,
  userId: string,
  startDate: string,
  endDate: string,
): Promise<TimeBlock[]> {
  const { data, error } = await supabase
    .from('time_blocks')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date')
    .order('start_time')
  if (error) throw error
  return data as unknown as TimeBlock[]
}

export async function getPlansForDateRange(
  supabase: Supabase,
  userId: string,
  startDate: string,
  endDate: string,
): Promise<DailyPlan[]> {
  const { data, error } = await supabase
    .from('daily_plans')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
  if (error) throw error
  return (data ?? []) as unknown as DailyPlan[]
}

export async function getTaskCountsForDateRange(
  supabase: Supabase,
  userId: string,
  startDate: string,
  endDate: string,
): Promise<{ date: string; total: number; done: number }[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('scheduled_date, status')
    .eq('user_id', userId)
    .gte('scheduled_date', startDate)
    .lte('scheduled_date', endDate)
    .not('scheduled_date', 'is', null)
  if (error) throw error
  const map: Record<string, { total: number; done: number }> = {}
  for (const t of data ?? []) {
    const d = t.scheduled_date as string
    if (!map[d]) map[d] = { total: 0, done: 0 }
    map[d].total++
    if (t.status === 'done') map[d].done++
  }
  return Object.entries(map).map(([date, counts]) => ({ date, ...counts }))
}

// Dünden kalan tamamlanmamış görevler
export async function getCarryoverTasks(supabase: Supabase, userId: string): Promise<Task[]> {
  const today = todayDate()

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .lt('scheduled_date', today)
    .not('status', 'in', '(done,deferred)')
    .order('scheduled_date')

  if (error) throw error
  return data as unknown as Task[]
}
