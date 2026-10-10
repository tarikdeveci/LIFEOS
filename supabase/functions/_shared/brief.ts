/**
 * Sabah özeti seçimi: en çok 3 öncelik, 1 bakım, varsa 1 manevi/sosyal plan.
 * AI yok, kuralla seçilir. Importsuz saf modül: supabase/functions/_shared/brief.ts
 * ile birebir aynı tutulur (tests/shared/dailyBrief.test.ts doğrular).
 */

export type BriefArea = 'career' | 'health' | 'personal' | 'spiritual' | 'social'

/** Bugüne planlı görev. `area` etkin alandır: görevin kendi alanı, yoksa rutininki. */
export interface BriefTask {
  id: string
  title: string
  area: BriefArea | null
  status: string
  priority_score: number
  goal_id: string | null
  created_at: string
}

/** Bugünün bloğu. `area` rutin şablonundan gelir; yoksa blok tipinden çıkarılır. */
export interface BriefBlock {
  id: string
  task_id: string | null
  label: string | null
  block_type: string
  start_time: string
  routine_id: string | null
  area: BriefArea | null
  completed_at: string | null
}

export interface BriefHabit {
  routine_id: string
  title: string
  area: BriefArea | null
  is_untracked: boolean
  week_done: number
  week_target: number
  done_today: boolean
}

export interface BriefInput {
  tasks: readonly BriefTask[]
  blocks: readonly BriefBlock[]
  habits: readonly BriefHabit[]
  /** goal_id → goals.daily_cap */
  goalCaps: Readonly<Record<string, number>>
  maxDeepTasks: number
}

export interface BriefItem {
  /** 'task:<id>' | 'block:<id>' | 'habit:<rutin id>' (gün raporu anahtarlarıyla aynı) */
  key: string
  title: string
  area: BriefArea | null
  start_time: string | null
  done: boolean
}

export interface DailyBrief {
  priorities: BriefItem[]
  care: BriefItem | null
  spirit: BriefItem | null
}

interface Candidate extends BriefItem {
  priority: number
  goal_id: string | null
  created_at: string
}

/** Görevsiz blok WSJF puanı taşımaz; varsayılan puanla (3+3+3)/(3+3) yarışır. */
const BLOCK_PRIORITY = 1.5
const MAX_PRIORITIES = 3

function blockArea(b: BriefBlock): BriefArea | null {
  if (b.area) return b.area
  if (b.block_type === 'workout') return 'health'
  if (b.block_type === 'break' && b.routine_id) return 'personal'
  return null
}

function byTime(a: BriefItem, b: BriefItem): number {
  if (a.start_time === b.start_time) return 0
  if (a.start_time === null) return 1
  if (b.start_time === null) return -1
  return a.start_time < b.start_time ? -1 : 1
}

function candidates(input: BriefInput): Candidate[] {
  const blockTime = new Map<string, string>()
  for (const b of input.blocks) {
    if (!b.task_id) continue
    const prev = blockTime.get(b.task_id)
    if (!prev || b.start_time < prev) blockTime.set(b.task_id, b.start_time)
  }
  const out: Candidate[] = []
  for (const t of input.tasks) {
    if (t.status === 'deferred') continue
    out.push({
      key: `task:${t.id}`,
      title: t.title,
      area: t.area,
      start_time: blockTime.get(t.id) ?? null,
      done: t.status === 'done',
      priority: t.priority_score,
      goal_id: t.goal_id,
      created_at: t.created_at,
    })
  }
  for (const b of input.blocks) {
    if (b.task_id) continue
    const area = blockArea(b)
    const isWork = b.block_type === 'task' || b.block_type === 'focus'
    if (!area && !isWork) continue
    out.push({
      key: `block:${b.id}`,
      title: b.label ?? '',
      area: area ?? null,
      start_time: b.start_time,
      done: b.completed_at !== null,
      priority: BLOCK_PRIORITY,
      goal_id: null,
      created_at: '',
    })
  }
  return out
}

function toItem(c: BriefItem): BriefItem {
  return { key: c.key, title: c.title, area: c.area, start_time: c.start_time, done: c.done }
}

export function pickDailyBrief(input: BriefInput): DailyBrief {
  const all = candidates(input)
  const limit = Math.max(1, Math.min(MAX_PRIORITIES, Math.floor(input.maxDeepTasks) || MAX_PRIORITIES))

  const work = all
    .filter((c) => c.area === null || c.area === 'career')
    .sort((a, b) => b.priority - a.priority || byTime(a, b) || (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
  const perGoal = new Map<string, number>()
  const priorities: BriefItem[] = []
  for (const c of work) {
    if (priorities.length >= limit) break
    if (c.goal_id) {
      const cap = input.goalCaps[c.goal_id]
      const used = perGoal.get(c.goal_id) ?? 0
      if (cap !== undefined && used >= cap) continue
      perGoal.set(c.goal_id, used + 1)
    }
    priorities.push(toItem(c))
  }

  const planned = (areas: readonly BriefArea[]): BriefItem | null => {
    const hit = all.filter((c) => c.area !== null && areas.includes(c.area)).sort(byTime)[0]
    return hit ? toItem(hit) : null
  }

  let care = planned(['health', 'personal'])
  if (!care) {
    const open = input.habits.filter(
      (h) => !h.is_untracked && !h.done_today && h.week_done < h.week_target && (h.area === 'health' || h.area === 'personal'),
    )
    const habit = open.find((h) => h.area === 'health') ?? open[0]
    if (habit) {
      care = { key: `habit:${habit.routine_id}`, title: habit.title, area: habit.area, start_time: null, done: false }
    }
  }

  // Manevi ve sosyal: yalnızca bugüne gerçekten planlanmış iş. Alışkanlık buraya itilmez.
  return { priorities, care, spirit: planned(['spiritual', 'social']) }
}
