// Sabah slotunun özet yolu: pickDailyBrief ile 3 öncelik, 1 bakım, varsa manevi/sosyal plan.
// Satırları kurala çevirmek saf (toBriefInput), veri çekmek loadMorningBrief'te.

import { type BriefBlock, type BriefHabit, type BriefInput, type BriefTask, type DailyBrief, pickDailyBrief } from '../_shared/brief.ts'
import { mondayOf } from '../_shared/report/dates.ts'
import {
  type Db,
  type FactsBlock,
  type FactsCompletion,
  type FactsRoutine,
  type FactsTask,
  habitDoneOn,
  habitWeekDone,
  isHabitActive,
  rowsOf,
  toArea,
} from '../_shared/report/facts.ts'

const DEFAULT_MAX_DEEP_TASKS = 3

export interface MorningTaskRow extends FactsTask {
  goal_id: string | null
  priority_score: number | string | null
  created_at: string
}

export interface MorningRows {
  tasks: readonly MorningTaskRow[]
  blocks: readonly FactsBlock[]
  routines: readonly FactsRoutine[]
  completions: readonly FactsCompletion[]
  /** goal id → goals.daily_cap */
  goalCaps: Readonly<Record<string, number>>
  maxDeepTasks: number
}

/**
 * Bugüne planlı satırları BriefInput'a çevirir. Biten iş baştan elenir: sabah özeti
 * "bugün yapılacak" olanları sayar, yapılmış olan öncelik yuvasını işgal etmez.
 */
export function toBriefInput(rows: MorningRows, date: string): BriefInput {
  const routines = new Map(rows.routines.map((r) => [r.id, r]))
  const routineOf = (id: string | null) => (id ? routines.get(id) : undefined)

  const tasks: BriefTask[] = rows.tasks
    .filter((t) => t.status !== 'done')
    .map((t) => ({
      id: t.id,
      title: t.title,
      area: t.area ?? routineOf(t.routine_id)?.area ?? null,
      status: t.status,
      priority_score: Number(t.priority_score) || 0,
      goal_id: t.goal_id,
      created_at: t.created_at,
    }))

  const blocks: BriefBlock[] = rows.blocks
    .filter((b) => b.completed_at === null)
    .map((b) => {
      const routine = routineOf(b.routine_id)
      return {
        id: b.id,
        task_id: b.task_id,
        label: b.label?.trim() || routine?.title || null,
        block_type: b.block_type,
        start_time: b.start_time.slice(0, 5),
        routine_id: b.routine_id,
        // Blokta alan kolonu yok: rutinin alanı. Tipten çıkarım pickDailyBrief'in işi.
        area: routine?.area ?? null,
        completed_at: null,
      }
    })

  const habits: BriefHabit[] = rows.routines
    .filter((r) => isHabitActive(r, date) && r.times_per_week !== null)
    .map((r) => ({
      routine_id: r.id,
      title: r.title,
      area: r.area,
      is_untracked: r.is_untracked,
      week_done: habitWeekDone(rows.completions, r, date),
      week_target: r.times_per_week ?? 0,
      done_today: habitDoneOn(rows.completions, r, date),
    }))

  return { tasks, blocks, habits, goalCaps: rows.goalCaps, maxDeepTasks: rows.maxDeepTasks }
}

function maxDeepTasksOf(preferences: unknown): number {
  const planning = (preferences as { planning?: { max_deep_tasks?: unknown } } | null)?.planning
  const value = planning?.max_deep_tasks
  return typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_MAX_DEEP_TASKS
}

/**
 * Sabah özeti. ASLA fırlatmaz: özet bildirimin yeni biçimi, sabah bildiriminin kendisi
 * değil. Hata ya da veri eksikliğinde null döner, çağıran mevcut sabah metnine düşer
 * (065 uygulanmadan fonksiyon yayınlanırsa da böyle).
 */
export async function loadMorningBrief(db: Db, userId: string, date: string): Promise<DailyBrief | null> {
  try {
    const [tasks, blocks, routines, completions, goals, profile] = await Promise.all([
      db.from('tasks')
        .select('id, title, status, area, routine_id, estimated_minutes, goal_id, priority_score, created_at')
        .eq('user_id', userId).eq('scheduled_date', date)
        .not('status', 'in', '(done,deferred,blocked)'),
      db.from('time_blocks')
        .select('id, task_id, label, block_type, start_time, end_time, routine_id, completed_at')
        .eq('user_id', userId).eq('date', date),
      db.from('routines')
        .select('id, title, kind, area, times_per_week, times_per_day, estimated_minutes, target_count, is_untracked, is_active, starts_on, ends_on')
        .eq('user_id', userId),
      db.from('routine_completions')
        .select('routine_id, completed_on, count')
        .eq('user_id', userId).gte('completed_on', mondayOf(date)).lte('completed_on', date),
      db.from('goals').select('id, daily_cap').eq('user_id', userId).eq('status', 'active').not('daily_cap', 'is', null),
      db.from('user_profiles').select('preferences').eq('id', userId).maybeSingle(),
    ])

    if (profile.error) throw new Error(`user_profiles: ${profile.error.message}`)
    const goalCaps: Record<string, number> = {}
    for (const g of rowsOf<{ id: string; daily_cap: number }>(goals, 'goals')) goalCaps[g.id] = g.daily_cap

    return pickDailyBrief(
      toBriefInput(
        {
          tasks: rowsOf<Omit<MorningTaskRow, 'area'> & { area: unknown }>(tasks, 'tasks').map((t) => ({ ...t, area: toArea(t.area) })),
          blocks: rowsOf<FactsBlock>(blocks, 'time_blocks'),
          routines: rowsOf<Omit<FactsRoutine, 'area'> & { area: unknown }>(routines, 'routines').map((r) => ({ ...r, area: toArea(r.area) })),
          completions: rowsOf<FactsCompletion>(completions, 'routine_completions'),
          goalCaps,
          maxDeepTasks: maxDeepTasksOf((profile.data as { preferences?: unknown } | null)?.preferences),
        },
        date,
      ),
    )
  } catch (err) {
    console.error(`sabah ozeti hazirlanamadi (${userId}):`, err instanceof Error ? err.message : err)
    return null
  }
}
