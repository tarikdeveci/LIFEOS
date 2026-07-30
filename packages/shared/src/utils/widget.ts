/**
 * Widget anlık görüntüsü (snapshot) — ana ekran ve kilit ekranı widget'larının
 * gösterdiği veri. Saf fonksiyon: store verisini alır, platform-bağımsız bir
 * JSON üretir. Yazma/okuma platform katmanında yapılır.
 *
 * iOS: App Group UserDefaults → SwiftUI widget okur.
 * Android: AsyncStorage → widget task handler okur.
 */

import type { Task } from '../types/task'
import type { TimeBlock } from '../types/planning'
import { getDayPosition, minutesToClock } from './schedule'
import { toDateString } from './date'

export interface WidgetBlock {
  label: string
  blockType: string
  startTime: string // 'HH:MM'
  endTime: string // 'HH:MM'
  /** 0-1, sadece aktif blok için anlamlı */
  progress: number
  remainingMinutes: number
  minutesUntilStart: number
}

export interface WidgetSnapshot {
  updatedAt: string
  /** Snapshot'ın ait olduğu takvim günü — widget bayat mı diye kontrol için */
  date: string
  /** Şu an içinde bulunulan blok */
  currentBlock: WidgetBlock | null
  /** Sıradaki blok */
  nextBlock: WidgetBlock | null
  /** Günün tüm blokları bitti mi */
  dayOver: boolean
  pendingTasks: number
  doneTasks: number
  /** En yüksek öncelikli bekleyen görevin başlığı */
  topTaskTitle: string | null
  calories: { consumed: number; target: number } | null
  steps: { value: number; goal: number } | null
}

export interface WidgetSnapshotInput {
  tasks: Task[]
  timeBlocks: TimeBlock[]
  caloriesConsumed: number | null
  caloriesTarget: number | null
  steps: number | null
  stepGoal: number | null
  now?: Date
}

function toWidgetBlock(
  block: TimeBlock,
  timing: { progress: number; remainingMinutes: number; minutesUntilStart: number },
): WidgetBlock {
  return {
    label: block.label ?? block.block_type,
    blockType: block.block_type,
    startTime: block.start_time.slice(0, 5),
    endTime: block.end_time.slice(0, 5),
    progress: timing.progress,
    remainingMinutes: timing.remainingMinutes,
    minutesUntilStart: timing.minutesUntilStart,
  }
}

export function buildWidgetSnapshot(input: WidgetSnapshotInput): WidgetSnapshot {
  const now = input.now ?? new Date()
  const today = toDateString(now)

  const todayBlocks = input.timeBlocks.filter((b) => b.date === today)
  const position = getDayPosition(todayBlocks, now)

  const todayTasks = input.tasks.filter((t) => t.scheduled_date === today)
  const pending = todayTasks.filter((t) => t.status !== 'done')
  const done = todayTasks.filter((t) => t.status === 'done').length

  const topTask = pending
    .slice()
    .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0))[0]

  return {
    updatedAt: now.toISOString(),
    date: today,
    currentBlock:
      position.activeBlock && position.activeTiming
        ? toWidgetBlock(position.activeBlock, position.activeTiming)
        : null,
    nextBlock:
      position.nextBlock && position.nextTiming
        ? toWidgetBlock(position.nextBlock, position.nextTiming)
        : null,
    dayOver: position.afterLastBlock,
    pendingTasks: pending.length,
    doneTasks: done,
    topTaskTitle: topTask?.title ?? null,
    calories:
      input.caloriesConsumed !== null && input.caloriesTarget !== null && input.caloriesTarget > 0
        ? { consumed: Math.round(input.caloriesConsumed), target: Math.round(input.caloriesTarget) }
        : null,
    steps:
      input.steps !== null && input.stepGoal !== null && input.stepGoal > 0
        ? { value: Math.round(input.steps), goal: Math.round(input.stepGoal) }
        : null,
  }
}

/** Boş/başlangıç snapshot'ı — widget ilk eklendiğinde veri yokken */
export function emptyWidgetSnapshot(now: Date = new Date()): WidgetSnapshot {
  return {
    updatedAt: now.toISOString(),
    date: toDateString(now),
    currentBlock: null,
    nextBlock: null,
    dayOver: false,
    pendingTasks: 0,
    doneTasks: 0,
    topTaskTitle: null,
    calories: null,
    steps: null,
  }
}

/** minutesToClock re-export — widget katmanı schedule'a ayrıca bağlanmasın */
export { minutesToClock }
