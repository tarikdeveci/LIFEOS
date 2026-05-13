import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'
import type { Task, TaskFilters, CreateTaskInput, UpdateTaskInput, TaskStatus, ChecklistItem } from '../types/task'
import { toDateString } from '../utils/date'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any>
type TaskInsert = Database['public']['Tables']['tasks']['Insert']
type TaskUpdate = Database['public']['Tables']['tasks']['Update']
type TaskDetailsInsert = Database['public']['Tables']['task_details']['Insert']

export async function getTasks(
  supabase: Supabase,
  userId: string,
  filters: TaskFilters = {},
): Promise<Task[]> {
  let query = supabase
    .from('tasks')
    .select(filters.include_details ? '*, task_details(*)' : '*')
    .eq('user_id', userId)
    .order('priority_score', { ascending: false })

  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status]
    query = query.in('status', statuses)
  }

  if (filters.scheduled_date !== undefined) {
    if (filters.scheduled_date === null) {
      query = query.is('scheduled_date', null)
    } else {
      query = query.eq('scheduled_date', filters.scheduled_date)
    }
  }

  if (filters.tags && filters.tags.length > 0) {
    query = query.overlaps('tags', filters.tags)
  }

  if (filters.parent_task_id !== undefined) {
    if (filters.parent_task_id === null) {
      query = query.is('parent_task_id', null)
    } else {
      query = query.eq('parent_task_id', filters.parent_task_id)
    }
  }

  const { data, error } = await query

  if (error) throw error
  return data as unknown as Task[]
}

export async function getTaskById(supabase: Supabase, taskId: string): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, task_details(*)')
    .eq('id', taskId)
    .single()

  if (error) throw error
  return data as unknown as Task
}

export async function createTask(
  supabase: Supabase,
  userId: string,
  input: CreateTaskInput,
): Promise<Task> {
  const payload: TaskInsert = {
    user_id: userId,
    title: input.title,
    description: input.description ?? null,
    status: input.status ?? 'backlog',
    parent_task_id: input.parent_task_id ?? null,
    due_date: input.due_date ?? null,
    scheduled_date: input.scheduled_date ?? null,
    estimated_minutes: input.estimated_minutes ?? null,
    tags: input.tags ?? [],
    value_score: input.value_score ?? 3,
    urgency_score: input.urgency_score ?? 3,
    risk_score: input.risk_score ?? 3,
    effort_score: input.effort_score ?? 3,
    friction_score: input.friction_score ?? 3,
  }

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .insert(payload)
    .select()
    .single()

  if (taskError) throw taskError

  // task_details otomatik oluştur
  const detailPayload: TaskDetailsInsert = { task_id: task.id }
  const { error: detailError } = await supabase.from('task_details').insert(detailPayload)

  if (detailError) throw detailError

  return task as unknown as Task
}

export async function updateTask(
  supabase: Supabase,
  taskId: string,
  updates: UpdateTaskInput,
): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update(updates as TaskUpdate)
    .eq('id', taskId)
    .select()
    .single()

  if (error) throw error
  return data as unknown as Task
}

export async function deleteTask(supabase: Supabase, taskId: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', taskId)
  if (error) throw error
}

export async function updateTaskStatus(
  supabase: Supabase,
  taskId: string,
  newStatus: TaskStatus,
): Promise<Task> {
  const updates: UpdateTaskInput = {
    status: newStatus,
    completed_at: newStatus === 'done' ? new Date().toISOString() : null,
  }

  return updateTask(supabase, taskId, updates)
}

export async function getTasksByDate(
  supabase: Supabase,
  userId: string,
  date: string,
): Promise<Task[]> {
  return getTasks(supabase, userId, { scheduled_date: date })
}

export async function getBacklogTasks(supabase: Supabase, userId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .is('scheduled_date', null)
    .not('status', 'in', '(done,deferred)')
    .order('priority_score', { ascending: false })

  if (error) throw error
  return data as unknown as Task[]
}

export async function reorderTasks(
  supabase: Supabase,
  taskIds: string[],
): Promise<void> {
  await Promise.all(
    taskIds.map(async (id, index) => {
      const { error } = await supabase.from('tasks').update({ sort_order: index }).eq('id', id)
      if (error) throw error
    }),
  )
}

export async function getSubtasks(supabase: Supabase, parentTaskId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('parent_task_id', parentTaskId)
    .order('sort_order')

  if (error) throw error
  return data as unknown as Task[]
}

// Realtime subscription helper
export function subscribeToTasks(
  supabase: Supabase,
  userId: string,
  callback: (event: { eventType: string; new: unknown; old: unknown }) => void,
) {
  return supabase
    .channel(`tasks:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${userId}` },
      callback,
    )
    .subscribe()
}

// 7 günlük görev istatistiği — haftalık chart için
export async function getWeeklyTaskStats(
  supabase: Supabase,
  userId: string,
  startDate: string, // 'YYYY-MM-DD' (haftanın başı)
): Promise<Array<{ date: string; total: number; completed: number }>> {
  const [y, m, d] = startDate.split('-').map(Number) as [number, number, number]
  const endDate = toDateString(new Date(y, m - 1, d + 6))

  // Sorgu 1: Bu hafta scheduled_date'i olan görevler (planlanan)
  const { data: scheduled, error: e1 } = await supabase
    .from('tasks')
    .select('scheduled_date, status')
    .eq('user_id', userId)
    .gte('scheduled_date', startDate)
    .lte('scheduled_date', endDate)
    .not('scheduled_date', 'is', null)
  if (e1) throw e1

  // Sorgu 2: Bu hafta tamamlanan görevler (completed_at ile — scheduled olmayan görevler dahil)
  const weekStart = new Date(y, m - 1, d)
  const weekEndExclusive = new Date(y, m - 1, d + 7)
  const { data: completedTasks, error: e2 } = await supabase
    .from('tasks')
    .select('completed_at')
    .eq('user_id', userId)
    .eq('status', 'done')
    .gte('completed_at', weekStart.toISOString())
    .lt('completed_at', weekEndExclusive.toISOString())
    .not('completed_at', 'is', null)
  if (e2) throw e2

  const byDate = new Map<string, { total: number; completed: number }>()

  // Planlanan görevleri gün başına topla
  for (const task of scheduled as Array<{ scheduled_date: string; status: string }>) {
    const date = task.scheduled_date
    const existing = byDate.get(date) ?? { total: 0, completed: 0 }
    byDate.set(date, { total: existing.total + 1, completed: existing.completed })
  }

  // Tamamlanan görevleri yerel tarihlerine göre topla (scheduled olmayan görevler dahil)
  for (const task of completedTasks as Array<{ completed_at: string }>) {
    const localDate = toDateString(new Date(task.completed_at))
    const existing = byDate.get(localDate) ?? { total: 0, completed: 0 }
    byDate.set(localDate, {
      total: Math.max(existing.total, existing.completed + 1),
      completed: existing.completed + 1,
    })
  }

  return Array.from(byDate.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// Task details (checklist) update
export async function updateTaskDetails(
  supabase: Supabase,
  taskId: string,
  updates: { notes?: string; checklist?: ChecklistItem[] },
): Promise<void> {
  const payload: Record<string, unknown> = {}
  if (updates.notes !== undefined) payload.notes = updates.notes
  if (updates.checklist !== undefined) {
    payload.checklist = updates.checklist as unknown as import('../types/database').Json
  }

  const { error } = await supabase
    .from('task_details')
    .update(payload)
    .eq('task_id', taskId)

  if (error) throw error
}
