import type { BlockType, TimeBlock } from '../types/planning'
import type { Task } from '../types/task'
import type { MacroSummary } from '../types/nutrition'
import type { WorkoutStatus } from '../types/workout'
import { shiftIsoDate, toDateString } from './date'

/**
 * Haftalık değerlendirme özeti. Saf fonksiyon: veri dışarıdan gelir, bu
 * yüzden aynı 14 günlük veriden hem bu hafta hem geçen hafta çıkarılabilir
 * (her girdi haftanın aralığına göre burada süzülür).
 */

export type ReviewBlock = Pick<TimeBlock, 'date' | 'start_time' | 'end_time' | 'block_type' | 'completed_at'>
export type ReviewTask = Pick<Task, 'id' | 'title' | 'status' | 'scheduled_date' | 'completed_at'>

export interface WeekReviewInput {
  /** Haftanın pazartesisi, YYYY-MM-DD */
  start: string
  /** Bugün (yerel); henüz gelmemiş günlerin görevleri "yarım kalan" sayılmaz */
  today: string
  blocks: ReviewBlock[]
  completedTasks: ReviewTask[]
  scheduledTasks: ReviewTask[]
  nutrition: MacroSummary[]
  workouts: Array<{ date: string; status: WorkoutStatus | 'none' }>
  plans: Array<{ date: string; energy_level: number | null }>
}

export interface ReviewDay {
  date: string
  plannedMinutes: number
  completedMinutes: number
  tasksCompleted: number
}

export interface WeekReview {
  start: string
  end: string
  days: ReviewDay[]
  plannedMinutes: number
  completedMinutes: number
  /** Tamamlanan blok süresinin planlanana oranı (0-1); plan yoksa null */
  blockRate: number | null
  /** Planlanan süreye göre çoktan aza; boş türler yok */
  minutesByType: Array<{ type: BlockType; planned: number; completed: number }>
  tasksCompleted: number
  completed: ReviewTask[]
  scheduledTotal: number
  scheduledDone: number
  scheduledRate: number | null
  /** Bu haftanın geçmiş günlerine planlanıp bitmeyen görevler */
  carryover: ReviewTask[]
  loggedDays: number
  avgCalories: number | null
  avgProtein: number | null
  workoutsDone: number
  workoutsPlanned: number
  avgEnergy: number | null
  /** En çok iş çıkan gün; hiç iş yoksa null */
  bestDay: string | null
}

function toMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length
}

function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null
}

export function summarizeWeek(input: WeekReviewInput): WeekReview {
  const start = input.start
  const end = shiftIsoDate(start, 6)
  const inWeek = (date: string | null | undefined): date is string => !!date && date >= start && date <= end

  const days: ReviewDay[] = Array.from({ length: 7 }, (_, index) => ({
    date: shiftIsoDate(start, index), plannedMinutes: 0, completedMinutes: 0, tasksCompleted: 0,
  }))
  const dayOf = (date: string) => days.find((day) => day.date === date)
  const byType = new Map<BlockType, { planned: number; completed: number }>()

  for (const block of input.blocks) {
    if (!inWeek(block.date)) continue
    const minutes = Math.max(0, toMinutes(block.end_time) - toMinutes(block.start_time))
    const done = block.completed_at != null
    const day = dayOf(block.date)
    if (day) {
      day.plannedMinutes += minutes
      if (done) day.completedMinutes += minutes
    }
    const type = block.block_type ?? 'task'
    const bucket = byType.get(type) ?? { planned: 0, completed: 0 }
    bucket.planned += minutes
    if (done) bucket.completed += minutes
    byType.set(type, bucket)
  }

  // Tamamlanma anı UTC saklanır; hangi güne düştüğü tarayıcının yerel saatine göre
  const completed = input.completedTasks.filter((task) => {
    const date = task.completed_at ? toDateString(new Date(task.completed_at)) : null
    if (!inWeek(date)) return false
    const day = dayOf(date)
    if (day) day.tasksCompleted += 1
    return true
  })

  const scheduled = input.scheduledTasks.filter((task) => inWeek(task.scheduled_date))
  const scheduledDone = scheduled.filter((task) => task.status === 'done').length
  const carryover = scheduled.filter((task) =>
    task.status !== 'done' && task.status !== 'deferred' && (task.scheduled_date ?? '') < input.today)

  const logged = input.nutrition.filter((day) => inWeek(day.date) && day.meal_count > 0)
  const workouts = input.workouts.filter((workout) => inWeek(workout.date) && workout.status !== 'none')
  const energy = input.plans
    .filter((plan) => inWeek(plan.date) && plan.energy_level != null)
    .map((plan) => plan.energy_level as number)

  const plannedMinutes = days.reduce((sum, day) => sum + day.plannedMinutes, 0)
  const completedMinutes = days.reduce((sum, day) => sum + day.completedMinutes, 0)
  // Görev başına yarım saat: blok kullanmayan kullanıcıda da en iyi gün çıksın
  const score = (day: ReviewDay) => day.completedMinutes + day.tasksCompleted * 30
  const best = days.reduce<ReviewDay | null>((top, day) => (score(day) > (top ? score(top) : 0) ? day : top), null)

  return {
    start,
    end,
    days,
    plannedMinutes,
    completedMinutes,
    blockRate: ratio(completedMinutes, plannedMinutes),
    minutesByType: Array.from(byType.entries())
      .map(([type, value]) => ({ type, ...value }))
      .filter((entry) => entry.planned > 0)
      .sort((a, b) => b.planned - a.planned),
    tasksCompleted: completed.length,
    completed,
    scheduledTotal: scheduled.length,
    scheduledDone,
    scheduledRate: ratio(scheduledDone, scheduled.length),
    carryover,
    loggedDays: logged.length,
    avgCalories: average(logged.map((day) => day.calories)),
    avgProtein: average(logged.map((day) => day.protein)),
    workoutsDone: workouts.filter((workout) => workout.status === 'completed').length,
    workoutsPlanned: workouts.length,
    avgEnergy: average(energy),
    bestDay: best?.date ?? null,
  }
}
