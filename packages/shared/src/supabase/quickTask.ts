import type { SupabaseClient } from '@supabase/supabase-js'
import type { Task } from '../types/task'
import type { TaskSource } from '../types/integration'
import type { QuickParseResult } from '../utils/quickParse'
import { addMinutesToClock } from '../utils/date'
import { DEFAULT_TASK_MINUTES } from '../utils/dayPlan'
import { createTasks } from './tasks'
import { createTimeBlocks } from './planning'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any>

/**
 * Hızlı eklemeden gelen görevi yazar. Saat verildiyse o güne görev bloğu da açılır
 * (süre yoksa 30 dk; gece yarısını aşmaz). Web, mobil ve Slack komutu aynı yolu kullanır.
 */
export async function createParsedTask(
  supabase: Supabase,
  userId: string,
  parsed: QuickParseResult,
  options: { source?: TaskSource; extraTags?: string[]; description?: string } = {},
): Promise<{ task: Task; blockCreated: boolean }> {
  const tags = Array.from(new Set([...(options.extraTags ?? []), ...parsed.tags])).slice(0, 20)
  const [task] = await createTasks(
    supabase,
    userId,
    [{
      title: parsed.title.slice(0, 500),
      status: parsed.scheduled_date ? 'planned' : 'backlog',
      ...(tags.length > 0 ? { tags } : {}),
      ...(options.description ? { description: options.description } : {}),
      ...(parsed.scheduled_date ? { scheduled_date: parsed.scheduled_date } : {}),
      ...(parsed.due_date ? { due_date: parsed.due_date } : {}),
      ...(parsed.estimated_minutes ? { estimated_minutes: parsed.estimated_minutes } : {}),
      ...(parsed.effort_score ? { effort_score: parsed.effort_score } : {}),
    }],
    options.source ? [{ source: options.source, external_id: null }] : undefined,
  )
  if (!task) throw new Error('görev oluşturulamadı')

  let blockCreated = false
  if (parsed.start_time && parsed.scheduled_date) {
    const minutes = parsed.estimated_minutes ?? DEFAULT_TASK_MINUTES
    const end = addMinutesToClock(parsed.start_time, minutes)
    const { inserted } = await createTimeBlocks(supabase, userId, [{
      date: parsed.scheduled_date,
      start_time: parsed.start_time,
      // Gece yarısını aşan blok gün sonunda biter.
      end_time: end > parsed.start_time ? end : '23:59',
      block_type: 'task',
      label: task.title,
      task_id: task.id,
    }])
    blockCreated = inserted > 0
  }
  return { task, blockCreated }
}
