// AI kurulum önerisinin doğrulaması. Model ham JSON döner; hiçbir şeyine güvenilmez.
// Kısıtlar 054 (routines), 059 (goals), 061 (times_per_day) ve 065 ile aynıdır: öneri
// onay ekranına ve oradan veritabanına yalnızca buradan geçmiş haliyle gider.
// Çökmez: kurtarılamayan öğe atılır ve başlığıyla `unsupported` listesine eklenir.

import type { GoalCountMode, GoalHorizon } from '../types/goal'
import type { LifeSetupProposal, SetupGoal, SetupRoutine, SetupTask } from '../types/lifeSetup'
import type { BlockType, LifeArea } from '../types/planning'
import type { RoutineKind, Weekday } from '../types/routine'
import type { PlanningRules } from '../types/user'
import { resolvePlanningRules } from './planningRules'

const TITLE_MAX = 200
const SUMMARY_MAX = 1000
const UNSUPPORTED_ITEM_MAX = 300
const UNIT_MAX = 20

const MAX_ROUTINES = 20
const MAX_GOALS = 10
const MAX_TASKS = 30
const MAX_UNSUPPORTED = 10
const MAX_STEPS = 12

const AREAS: readonly LifeArea[] = ['career', 'health', 'personal', 'spiritual', 'social']
const BLOCK_TYPES: readonly BlockType[] = ['task', 'routine', 'break', 'focus', 'meal', 'workout']
const KINDS: readonly RoutineKind[] = ['block', 'task', 'habit']
const HORIZONS: readonly GoalHorizon[] = ['quarter', 'month', 'week']
const COUNT_MODES: readonly GoalCountMode[] = ['tasks', 'hours']

const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/

type RawRecord = Record<string, unknown>

function isRecord(value: unknown): value is RawRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Tek satır metin: boşluklar tek aralığa iner, karakter sayılarak kesilir (vekil çifti bölünmez). */
function cleanLine(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return Array.from(value.replace(/\s+/g, ' ').trim()).slice(0, max).join('')
}

function cleanList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => cleanLine(item, max)).filter((item) => item !== '')
}

function pick<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

function intIn(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined
}

/** 'H:MM', 'HH:MM' ya da 'HH:MM:SS' gelir; 'HH:MM' döner. */
function timeOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const match = TIME_PATTERN.exec(value.trim())
  if (!match) return undefined
  return `${(match[1] ?? '').padStart(2, '0')}:${match[2] ?? '00'}`
}

/** Saat çifti birlikte ve bitiş > başlangıç değilse null (HH:MM metin karşılaştırması sıralıdır). */
function timeRange(rec: RawRecord): { start: string; end: string } | null {
  const start = timeOf(rec['start_time'])
  const end = timeOf(rec['end_time'])
  return start !== undefined && end !== undefined && end > start ? { start, end } : null
}

function daysOf(value: unknown): Weekday[] {
  if (!Array.isArray(value)) return []
  const days = new Set<number>()
  for (const day of value) {
    const valid = intIn(day, 0, 6)
    if (valid !== undefined) days.add(valid)
  }
  return [...days].sort((a, b) => a - b) as Weekday[]
}

function buildRoutine(rec: RawRecord, title: string): SetupRoutine | null {
  const kind = pick(rec['kind'], KINDS)
  if (!kind) return null

  const times = timeRange(rec)
  const days = daysOf(rec['days_of_week'])
  const perDay = kind === 'habit' ? intIn(rec['times_per_day'], 2, 20) : undefined
  // 061: günde N kez alışkanlıkta istemci times_per_week = 7 yazar (haftalık ilerleme "hedefi tutan gün").
  const perWeek = perDay !== undefined ? 7 : intIn(rec['times_per_week'], 1, 7)

  if (kind === 'block' && (times === null || days.length === 0)) return null
  if (kind === 'task' && days.length === 0) return null
  if (kind === 'habit' && perWeek === undefined) return null

  const routine: SetupRoutine = { title, kind, area: pick(rec['area'], AREAS) ?? null }
  if (kind === 'habit') {
    if (perWeek !== undefined) routine.times_per_week = perWeek
    if (perDay !== undefined) routine.times_per_day = perDay
  } else {
    routine.days_of_week = days
    const blockType = pick(rec['block_type'], BLOCK_TYPES)
    if (blockType) routine.block_type = blockType
  }
  if (times) {
    routine.start_time = times.start
    routine.end_time = times.end
  }

  const estimated = intIn(rec['estimated_minutes'], 1, 1440)
  if (estimated !== undefined) routine.estimated_minutes = estimated
  const minimum = intIn(rec['min_minutes'], 1, 600)
  if (minimum !== undefined) routine.min_minutes = minimum

  const target = intIn(rec['target_count'], 1, 999)
  if (target !== undefined) {
    routine.target_count = target
    // 0 varsayılandır, yazılmaz; hedefe eşit ya da üstü seriyi başlamadan bitirirdi.
    const start = intIn(rec['start_count'], 1, target - 1)
    if (start !== undefined) routine.start_count = start
  }

  if (rec['is_protected'] === true) routine.is_protected = true
  if (rec['is_untracked'] === true) routine.is_untracked = true
  return routine
}

function buildGoal(rec: RawRecord, title: string): SetupGoal | null {
  const horizon = pick(rec['horizon'], HORIZONS)
  if (!horizon) return null

  const goal: SetupGoal = { title, horizon }
  const target = rec['target']
  // 059: target ile count_mode birlikte gelir; sayı varsa sayım biçimi yoksa görev sayısı varsayılır.
  if (typeof target === 'number' && Number.isFinite(target) && target > 0) {
    goal.target = target
    goal.count_mode = pick(rec['count_mode'], COUNT_MODES) ?? 'tasks'
    const unit = cleanLine(rec['unit'], UNIT_MAX)
    if (unit) goal.unit = unit
  }
  const cap = intIn(rec['daily_cap'], 1, 10)
  if (cap !== undefined) goal.daily_cap = cap
  const steps = cleanList(rec['steps'], TITLE_MAX).slice(0, MAX_STEPS)
  if (steps.length > 0) goal.steps = steps
  return goal
}

function buildTask(rec: RawRecord, title: string): SetupTask {
  const task: SetupTask = { title, area: pick(rec['area'], AREAS) ?? null }
  const estimated = intIn(rec['estimated_minutes'], 1, 1440)
  if (estimated !== undefined) task.estimated_minutes = estimated
  return task
}

/**
 * Listedeki geçerli öğeleri tavana kadar alır. Başlığı olmayan öğe sessizce düşer (gösterilecek
 * bir şeyi yok); kurtarılamayan ya da tavanı aşan öğenin başlığı `dropped`'a gider.
 */
function collect<T>(
  raw: unknown,
  limit: number,
  build: (rec: RawRecord, title: string) => T | null,
  dropped: string[],
): T[] {
  if (!Array.isArray(raw)) return []
  const out: T[] = []
  for (const entry of raw) {
    if (!isRecord(entry)) continue
    const title = cleanLine(entry['title'], TITLE_MAX)
    if (!title) continue
    const item = out.length < limit ? build(entry, title) : null
    if (item) out.push(item)
    else dropped.push(title)
  }
  return out
}

/** Yalnızca gelen anahtarlar döner; sınırlar resolvePlanningRules ile aynı. */
function buildRules(raw: unknown): Partial<PlanningRules> {
  if (!isRecord(raw)) return {}
  const resolved = resolvePlanningRules(raw as Partial<PlanningRules>)
  const rules: Partial<PlanningRules> = {}
  if (typeof raw['max_deep_tasks'] === 'number' && Number.isFinite(raw['max_deep_tasks'])) {
    rules.max_deep_tasks = resolved.max_deep_tasks
  }
  if (typeof raw['buffer_minutes'] === 'number' && Number.isFinite(raw['buffer_minutes'])) {
    rules.buffer_minutes = resolved.buffer_minutes
  }
  if (raw['rollover'] === 'carry' || raw['rollover'] === 'backlog') rules.rollover = resolved.rollover
  if (typeof raw['about'] === 'string' && resolved.about !== '') rules.about = resolved.about
  return rules
}

/**
 * AI'den gelen ham öneriyi kısıtlara göre temizler. Her zaman geçerli bir öneri döner;
 * saçma girdide (nesne olmayan, boş) her liste boş, metinler boştur.
 */
export function sanitizeLifeSetup(raw: unknown): LifeSetupProposal {
  const rec: RawRecord = isRecord(raw) ? raw : {}
  const dropped: string[] = []
  const routines = collect(rec['routines'], MAX_ROUTINES, buildRoutine, dropped)
  const goals = collect(rec['goals'], MAX_GOALS, buildGoal, dropped)
  const tasks = collect(rec['tasks'], MAX_TASKS, buildTask, dropped)
  const unsupported = [...new Set([...cleanList(rec['unsupported'], UNSUPPORTED_ITEM_MAX), ...dropped])]
    .slice(0, MAX_UNSUPPORTED)

  return {
    summary: cleanLine(rec['summary'], SUMMARY_MAX),
    routines,
    goals,
    tasks,
    rules: buildRules(rec['rules']),
    unsupported,
  }
}
