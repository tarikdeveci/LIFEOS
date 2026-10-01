// Hedef hiyerarşisi için saf yardımcılar: periyot sınırları, ilerleme, değer puanı,
// aylık değerlendirme ve localStorage'daki eski haftalık hedeflerin taşınması.

import type {
  CreateGoalInput,
  Goal,
  GoalHorizon,
  GoalProgressInfo,
  GoalTaskLike,
} from '../types/goal'
import { shiftIsoDate, toDateString } from './date'
import { mondayOf } from './routine'

const pad = (n: number): string => String(n).padStart(2, '0')

function ymd(dateStr: string): [number, number, number] {
  const [y = 0, m = 1, d = 1] = dateStr.split('-').map(Number)
  return [y, m, d]
}

/** Tarihin içinde bulunduğu periyodun ilk günü (hafta: Pazartesi). */
export function goalPeriodStart(horizon: GoalHorizon, dateStr: string): string {
  if (horizon === 'week') return mondayOf(dateStr)
  const [y, m] = ymd(dateStr)
  if (horizon === 'month') return `${y}-${pad(m)}-01`
  const qMonth = Math.floor((m - 1) / 3) * 3 + 1
  return `${y}-${pad(qMonth)}-01`
}

/** Ay ekler; sonuç her zaman ayın ilk günü. */
export function addMonths(monthStart: string, delta: number): string {
  const [y, m] = ymd(monthStart)
  const idx = y * 12 + (m - 1) + delta
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}-01`
}

/** Periyodun son günü (dahil). */
export function goalPeriodEnd(horizon: GoalHorizon, periodStart: string): string {
  if (horizon === 'week') return shiftIsoDate(periodStart, 6)
  const next = addMonths(periodStart, horizon === 'month' ? 1 : 3)
  return shiftIsoDate(next, -1)
}

/** Görevin hangi güne sayılacağı: planlandığı gün, yoksa tamamlandığı yerel gün. */
function taskDay(task: GoalTaskLike): string | null {
  if (task.scheduled_date) return task.scheduled_date
  if (task.completed_at) return toDateString(new Date(task.completed_at))
  return null
}

function inPeriod(goal: Pick<Goal, 'horizon' | 'period_start'>, day: string | null): boolean {
  if (!day) return false
  return day >= goal.period_start && day <= goalPeriodEnd(goal.horizon, goal.period_start)
}

function matchesGoal(goal: Pick<Goal, 'id' | 'tag_filter'>, task: GoalTaskLike): boolean {
  if (task.goal_id === goal.id) return true
  const tags = task.tags ?? []
  return goal.tag_filter.some((tag) => tags.includes(tag))
}

/**
 * İlerleme.
 * - Sayılabilir hedef (target + count_mode): periyot içinde tamamlanmış, goal_id veya
 *   etiketle eşleşen görevler; sayı ya da saat (tahmin yoksa 60 dk).
 * - Oran: tamamlanan alt hedefler ve bağlı görevler / toplam. Bırakılan alt hedef sayılmaz.
 */
export function computeGoalProgress(
  goal: Pick<Goal, 'id' | 'horizon' | 'period_start' | 'target' | 'count_mode' | 'tag_filter' | 'status'>,
  tasks: GoalTaskLike[],
  children: { status: Goal['status']; pct: number }[] = [],
): GoalProgressInfo {
  if (goal.target != null && goal.count_mode) {
    const done = tasks.filter((t) => t.status === 'done' && matchesGoal(goal, t) && inPeriod(goal, taskDay(t)))
    // Saat kesirli kalır: tam saate yuvarlanınca 1 saatlik hedefte 30 dk %100, 25 dk %0 görünüyordu.
    const amount = goal.count_mode === 'tasks'
      ? done.length
      : done.reduce((s, t) => s + (t.estimated_minutes ?? 60), 0) / 60
    const current = Math.round(amount * 10) / 10
    return { current, total: goal.target, pct: Math.min(100, Math.round((amount / goal.target) * 100)) }
  }

  const liveChildren = children.filter((c) => c.status !== 'dropped')
  const linked = tasks.filter((t) => t.goal_id === goal.id)
  const total = liveChildren.length + linked.length
  const current = liveChildren.filter((c) => c.status === 'done' || c.pct >= 100).length
    + linked.filter((t) => t.status === 'done').length
  if (total === 0) return { current: 0, total: 0, pct: goal.status === 'done' ? 100 : 0 }
  return { current, total, pct: Math.round((current / total) * 100) }
}

/** Tüm ağacın ilerlemesi; önce haftalar, sonra aylar, sonra çeyrekler hesaplanır. */
export function goalTreeProgress(goals: Goal[], tasks: GoalTaskLike[]): Map<string, GoalProgressInfo> {
  const out = new Map<string, GoalProgressInfo>()
  for (const horizon of ['week', 'month', 'quarter'] as const) {
    for (const goal of goals.filter((g) => g.horizon === horizon)) {
      const children = goals
        .filter((c) => c.parent_id === goal.id)
        .map((c) => ({ status: c.status, pct: out.get(c.id)?.pct ?? 0 }))
      out.set(goal.id, computeGoalProgress(goal, tasks, children))
    }
  }
  return out
}

/** Hedefe bağlanan görevin değer puanı en az 4 olur; bağ kopunca olduğu gibi kalır. */
export function valueScoreForGoal(valueScore: number, goalId: string | null): number {
  return goalId ? Math.max(valueScore, 4) : valueScore
}

/** Değerlendirmesi bekleyen geçmiş ayların aktif hedefleri. */
export function goalsNeedingReview(goals: Goal[], today: string): Goal[] {
  const thisMonth = goalPeriodStart('month', today)
  return goals.filter((g) =>
    g.horizon === 'month' && g.status === 'active' && !g.reviewed_at && g.period_start < thisMonth,
  )
}

const LEGACY_COUNT_MODES = new Set(['tasks', 'hours'])

/**
 * localStorage `wgoals_<userId>` içeriğini bu haftanın hedeflerine çevirir.
 * Bozuk veya tanınmayan kayıt atlanır; hiç geçerli kayıt yoksa boş dizi.
 */
export function legacyWeeklyGoalsToInputs(raw: unknown, weekStartDate: string): CreateGoalInput[] {
  if (!Array.isArray(raw)) return []
  const out: CreateGoalInput[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const rec = item as Record<string, unknown>
    const title = typeof rec.label === 'string' ? rec.label.trim().slice(0, 200) : ''
    const target = typeof rec.target === 'number' && rec.target > 0 ? rec.target : null
    const countMode = typeof rec.countMode === 'string' && LEGACY_COUNT_MODES.has(rec.countMode)
      ? (rec.countMode as 'tasks' | 'hours')
      : null
    if (!title || target == null || !countMode) continue
    const tags = Array.isArray(rec.tagFilter)
      ? rec.tagFilter.filter((t): t is string => typeof t === 'string' && t.trim() !== '').map((t) => t.trim())
      : []
    out.push({
      horizon: 'week',
      title,
      period_start: weekStartDate,
      icon: typeof rec.icon === 'string' ? rec.icon.slice(0, 8) : null,
      target,
      unit: typeof rec.unit === 'string' ? rec.unit.slice(0, 20) : null,
      count_mode: countMode,
      tag_filter: tags,
    })
  }
  return out
}
