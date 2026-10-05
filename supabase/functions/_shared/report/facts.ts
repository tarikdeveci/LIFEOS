// Gün olguları: günün anlık görüntüsü (DayFacts), TEK yerde ve sunucuda hesaplanır.
//
// İki katman:
//   buildDayFacts: saf fonksiyon, ham satırlardan DayFacts kurar (Deno ve npm importu
//     yok, node --test ile denenir).
//   loadDayFacts: Supabase istemcisiyle satırları çeker, saf fonksiyonu çağırır.
//     Kullanıcı JWT'li ya da service role'lü istemciyle çalışır: her sorgu user_id ile
//     sınırlı. Program ilerlemesi dışarıdan (rutin id → biten oturum) verilir, çünkü
//     routine_done_count istemciye kapalı, my_routine_progress ise yalnız JWT ile çalışır.
//
// Neden anlık görüntü: gece devri (roll_over_tasks) scheduled_date'i değiştirir, bu
// yüzden "dün ne açık kaldı" sonradan yeniden kurulamaz.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

import { dayBoundsUtc, mondayOf } from './dates.ts'
import type { DayFacts, DayItem, DayMovement, DayNutrition, HabitWeek, LifeArea } from './types.ts'

export type Db = SupabaseClient

export interface FactsTask {
  id: string
  title: string
  status: string
  area: LifeArea | null
  routine_id: string | null
  estimated_minutes: number | null
}

export interface FactsBlock {
  id: string
  task_id: string | null
  label: string | null
  block_type: string
  /** 'HH:MM:SS' */
  start_time: string
  end_time: string
  routine_id: string | null
  completed_at: string | null
}

export interface FactsRoutine {
  id: string
  title: string
  kind: 'block' | 'task' | 'habit'
  area: LifeArea | null
  times_per_week: number | null
  times_per_day: number | null
  estimated_minutes: number | null
  target_count: number | null
  is_untracked: boolean
  is_active: boolean
  starts_on: string
  ends_on: string | null
}

export interface FactsCompletion {
  routine_id: string
  completed_on: string
  count: number
}

export interface FactsHealth {
  steps: number | null
  exercise_minutes: number | null
  workout_count: number | null
}

export interface FactsMeal {
  total_calories: number | null
  total_protein: number | string | null
}

export interface FactsInput {
  date: string
  tasks: readonly FactsTask[]
  /** O günün blokları. */
  blocks: readonly FactsBlock[]
  /** Kullanıcının tüm rutinleri (alan ve program için pasif olanlar da gerekir). */
  routines: readonly FactsRoutine[]
  /** Haftanın başından `date`'e kadar işaretler. */
  completions: readonly FactsCompletion[]
  energy: number | null
  focusMinutes: number
  health: FactsHealth | null
  /** workouts tablosunda o gün tamamlanmış antrenman var mı. */
  workoutCompleted: boolean
  meals: readonly FactsMeal[]
  calorieTarget: number | null
  /** rutin id → biten oturum sayısı (yalnız sayaçlı rutinler). */
  progress: Readonly<Record<string, number>>
  generatedAt: string
}

const AREAS: readonly string[] = ['career', 'health', 'personal', 'spiritual', 'social']

/** Veritabanından gelen serbest metni alana çevirir; tanımsızsa null. */
export function toArea(value: unknown): LifeArea | null {
  return typeof value === 'string' && AREAS.includes(value) ? (value as LifeArea) : null
}

// Rutin ve alışkanlık kuralları

export function isHabitActive(r: FactsRoutine, date: string): boolean {
  return r.kind === 'habit' && r.is_active && r.starts_on <= date && (r.ends_on === null || r.ends_on >= date)
}

/** Günde N kez alışkanlıkta sayaç N'ye ulaşmayan gün sayılmaz; sayaçsızda tek işaret yeter. */
function habitDays(completions: readonly FactsCompletion[], r: FactsRoutine): string[] {
  const need = r.times_per_day ?? 1
  return completions.filter((c) => c.routine_id === r.id && c.count >= need).map((c) => c.completed_on)
}

export function habitDoneOn(completions: readonly FactsCompletion[], r: FactsRoutine, date: string): boolean {
  return habitDays(completions, r).includes(date)
}

/** Haftanın başından `date`'e kadar hedefi tutan gün sayısı. */
export function habitWeekDone(completions: readonly FactsCompletion[], r: FactsRoutine, date: string): number {
  const monday = mondayOf(date)
  return new Set(habitDays(completions, r).filter((d) => d >= monday && d <= date)).size
}

// Alan, süre, saat

/** Blokta alan kolonu yok: rutinin alanı, yoksa tipten (brief.ts blockArea ile aynı kural). */
function blockArea(b: FactsBlock, routine: FactsRoutine | undefined): LifeArea | null {
  if (routine?.area) return routine.area
  if (b.block_type === 'workout') return 'health'
  if (b.block_type === 'break' && b.routine_id) return 'personal'
  return null
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':')
  return Number(h) * 60 + Number(m)
}

function blockMinutes(b: FactsBlock): number {
  return Math.max(0, toMinutes(b.end_time) - toMinutes(b.start_time))
}

function hhmm(time: string): string {
  return time.slice(0, 5)
}

/** Öğün blokları ve rutinsiz molalar rapora girmez: işaretlenecek bir iş değil. */
function isNoiseBlock(b: FactsBlock): boolean {
  return b.block_type === 'meal' || (b.block_type === 'break' && !b.routine_id)
}

function programOf(
  routine: FactsRoutine | undefined,
  progress: Readonly<Record<string, number>>,
): DayItem['program'] {
  if (!routine || routine.is_untracked || routine.target_count === null) return null
  const done = progress[routine.id]
  return done === undefined ? null : { done, target: routine.target_count }
}

function byTime(a: DayItem, b: DayItem): number {
  if (a.start_time !== b.start_time) {
    if (a.start_time === null) return 1
    if (b.start_time === null) return -1
    return a.start_time < b.start_time ? -1 : 1
  }
  const rank = { task: 0, block: 1, habit: 2 } as const
  return rank[a.kind] - rank[b.kind] || a.title.localeCompare(b.title)
}

// Saf hesap

function taskItem(t: FactsTask, blocks: readonly FactsBlock[], input: FactsInput, routine: FactsRoutine | undefined): DayItem {
  // Göreve bağlı blok ayrı öğe olmaz: görev bloğun saatini ve süresini alır.
  const starts = blocks.map((b) => hhmm(b.start_time)).sort()
  return {
    key: `task:${t.id}`,
    kind: 'task',
    title: t.title,
    area: t.area ?? routine?.area ?? null,
    minutes: blocks.length > 0 ? blocks.reduce((s, b) => s + blockMinutes(b), 0) : t.estimated_minutes,
    start_time: starts[0] ?? null,
    expected: !routine?.is_untracked,
    outcome: t.status === 'done' ? 'done' : 'open',
    reason: null,
    program: programOf(routine, input.progress),
  }
}

function blockItem(b: FactsBlock, input: FactsInput, routine: FactsRoutine | undefined): DayItem {
  return {
    key: `block:${b.id}`,
    kind: 'block',
    title: b.label?.trim() || routine?.title || b.block_type,
    area: blockArea(b, routine),
    minutes: blockMinutes(b),
    start_time: hhmm(b.start_time),
    expected: !routine?.is_untracked,
    outcome: b.completed_at !== null ? 'done' : 'open',
    reason: null,
    program: programOf(routine, input.progress),
  }
}

function habitItems(input: FactsInput): { items: DayItem[]; week: HabitWeek[] } {
  const items: DayItem[] = []
  const week: HabitWeek[] = []
  for (const r of input.routines) {
    if (!isHabitActive(r, input.date)) continue
    const done = habitDoneOn(input.completions, r, input.date)
    if (r.is_untracked) {
      // Sayaçsız alışkanlık itilmez ve eksik diye gösterilmez: yalnız yapıldıysa görünür.
      if (done) items.push(habitItem(r, true, false, input))
      continue
    }
    if (r.times_per_week !== null) {
      week.push({ routine_id: r.id, title: r.title, done: habitWeekDone(input.completions, r, input.date), target: r.times_per_week })
    }
    // Günlük alışkanlık bugün beklenir; haftalık esnek olanın bugün yapılması beklenmez.
    items.push(habitItem(r, done, r.times_per_day !== null || r.times_per_week === 7, input))
  }
  return { items, week }
}

function habitItem(r: FactsRoutine, done: boolean, expected: boolean, input: FactsInput): DayItem {
  return {
    key: `habit:${r.id}`,
    kind: 'habit',
    title: r.title,
    area: r.area,
    minutes: r.estimated_minutes,
    start_time: null,
    expected,
    outcome: done ? 'done' : 'open',
    reason: null,
    program: programOf(r, input.progress),
  }
}

function movementOf(input: FactsInput): DayMovement {
  return {
    exercise_minutes: input.health?.exercise_minutes ?? null,
    steps: input.health?.steps ?? null,
    workout_done: input.workoutCompleted || (input.health?.workout_count ?? 0) > 0,
  }
}

function nutritionOf(input: FactsInput): DayNutrition | null {
  if (input.meals.length === 0) return null
  return {
    calories: Math.round(input.meals.reduce((s, m) => s + Number(m.total_calories ?? 0), 0)),
    calorie_target: input.calorieTarget,
    protein_g: Math.round(input.meals.reduce((s, m) => s + Number(m.total_protein ?? 0), 0)),
    meals: input.meals.length,
  }
}

/** Ham satırlardan günün olgularını kurar. Yan etkisi yok. */
export function buildDayFacts(input: FactsInput): DayFacts {
  const routines = new Map(input.routines.map((r) => [r.id, r]))
  const routineOf = (id: string | null) => (id ? routines.get(id) : undefined)

  // Bağlı blok eşlemesi tüm görevlerle kurulur: ertelenmiş görevin bloğu da onunla gider.
  const taskIds = new Set(input.tasks.map((t) => t.id))
  const linked = new Map<string, FactsBlock[]>()
  for (const b of input.blocks) {
    if (!b.task_id || !taskIds.has(b.task_id)) continue
    linked.set(b.task_id, [...(linked.get(b.task_id) ?? []), b])
  }

  const items: DayItem[] = []
  for (const t of input.tasks) {
    // Ertelenmiş görevi kullanıcı bilerek park etti; kapanış sorusu çıkmaz.
    if (t.status === 'deferred') continue
    items.push(taskItem(t, linked.get(t.id) ?? [], input, routineOf(t.routine_id)))
  }
  for (const b of input.blocks) {
    if (b.task_id && taskIds.has(b.task_id)) continue
    if (isNoiseBlock(b)) continue
    items.push(blockItem(b, input, routineOf(b.routine_id)))
  }
  const habits = habitItems(input)
  items.push(...habits.items)

  return {
    date: input.date,
    energy: input.energy,
    items: items.sort(byTime),
    focus_minutes: input.focusMinutes,
    movement: movementOf(input),
    nutrition: nutritionOf(input),
    habits_week: habits.week,
    generated_at: input.generatedAt,
  }
}

// Yükleyici

export interface QueryResult {
  data: unknown
  error: { message: string } | null
}

/** Hata fırlatır: yarım okunmuş veriyle anlık görüntü yazmaktansa hiç yazmamak doğru. */
export function rowsOf<T>(res: QueryResult, label: string): T[] {
  if (res.error) throw new Error(`${label}: ${res.error.message}`)
  return (res.data ?? []) as T[]
}

export interface LoadFactsParams {
  userId: string
  date: string
  timezone: string
  progress: Readonly<Record<string, number>>
  now?: Date
}

export async function loadDayFacts(db: Db, p: LoadFactsParams): Promise<DayFacts> {
  const { userId, date } = p
  const bounds = dayBoundsUtc(date, p.timezone)

  const [tasks, blocks, routines, completions, plan, focus, health, workouts, meals, targets] = await Promise.all([
    db.from('tasks')
      .select('id, title, status, area, routine_id, estimated_minutes')
      .eq('user_id', userId).eq('scheduled_date', date),
    db.from('time_blocks')
      .select('id, task_id, label, block_type, start_time, end_time, routine_id, completed_at')
      .eq('user_id', userId).eq('date', date),
    db.from('routines')
      .select('id, title, kind, area, times_per_week, times_per_day, estimated_minutes, target_count, is_untracked, is_active, starts_on, ends_on')
      .eq('user_id', userId),
    db.from('routine_completions')
      .select('routine_id, completed_on, count')
      .eq('user_id', userId).gte('completed_on', mondayOf(date)).lte('completed_on', date),
    db.from('daily_plans').select('energy_level').eq('user_id', userId).eq('date', date),
    db.from('focus_sessions')
      .select('minutes')
      .eq('user_id', userId).gte('started_at', bounds.start).lt('started_at', bounds.end),
    db.from('health_daily').select('steps, exercise_minutes, workout_count').eq('user_id', userId).eq('date', date),
    db.from('workouts').select('id').eq('user_id', userId).eq('date', date).eq('status', 'completed').limit(1),
    db.from('meals').select('total_calories, total_protein').eq('user_id', userId).eq('date', date),
    db.from('nutrition_targets').select('calories').eq('user_id', userId).eq('is_active', true),
  ])

  const taskRows = rowsOf<Omit<FactsTask, 'area'> & { area: unknown }>(tasks, 'tasks')
  const routineRows = rowsOf<Omit<FactsRoutine, 'area'> & { area: unknown }>(routines, 'routines')

  return buildDayFacts({
    date,
    tasks: taskRows.map((t) => ({ ...t, area: toArea(t.area) })),
    blocks: rowsOf<FactsBlock>(blocks, 'time_blocks'),
    routines: routineRows.map((r) => ({ ...r, area: toArea(r.area) })),
    completions: rowsOf<FactsCompletion>(completions, 'routine_completions'),
    energy: rowsOf<{ energy_level: number | null }>(plan, 'daily_plans')[0]?.energy_level ?? null,
    focusMinutes: rowsOf<{ minutes: number }>(focus, 'focus_sessions').reduce((s, f) => s + f.minutes, 0),
    health: rowsOf<FactsHealth>(health, 'health_daily')[0] ?? null,
    workoutCompleted: rowsOf<{ id: string }>(workouts, 'workouts').length > 0,
    meals: rowsOf<FactsMeal>(meals, 'meals'),
    calorieTarget: rowsOf<{ calories: number | null }>(targets, 'nutrition_targets')[0]?.calories ?? null,
    progress: p.progress,
    generatedAt: (p.now ?? new Date()).toISOString(),
  })
}
