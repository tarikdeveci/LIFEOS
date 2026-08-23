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
  /**
   * Günün TÜM blokları (saat sırasına göre).
   *
   * `currentBlock`/`nextBlock` snapshot yazıldığı ANA göre donmuş değerlerdir;
   * uygulama kapalıyken blok geçişleri olmaz ve widget bir önceki bloğu
   * göstermeye devam eder. Widget tarafı bu listeden kendi saatine göre aktif
   * ve sıradaki bloğu kendisi seçebilsin diye tam listeyi de yazıyoruz.
   */
  blocks: WidgetBlock[]
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
    blocks: todayBlocks
      .slice()
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map((b) => toWidgetBlock(b, { progress: 0, remainingMinutes: 0, minutesUntilStart: 0 })),
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
    blocks: [],
    dayOver: false,
    pendingTasks: 0,
    doneTasks: 0,
    topTaskTitle: null,
    calories: null,
    steps: null,
  }
}

/** 'HH:MM' → gün içi dakika. Bozuk değerde null. */
function clockToMinutes(hhmm: string): number | null {
  const [h, m] = hhmm.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return (h as number) * 60 + (m as number)
}

export interface WidgetNow {
  currentBlock: WidgetBlock | null
  nextBlock: WidgetBlock | null
  dayOver: boolean
  /** Aktif bloğun 0-1 ilerlemesi */
  progress: number
  /** Aktif blokta kalan dakika */
  remainingMinutes: number
  /** Sıradaki bloğa kalan dakika */
  minutesUntilStart: number
  /** Snapshot başka bir güne aitse true — widget bayat veri göstermemeli */
  stale: boolean
}

/**
 * Snapshot + "şu an" → o ana ait blok durumu.
 *
 * Widget uygulama kapalıyken de doğru kalsın diye aktif/sıradaki blok
 * `snapshot.blocks` listesinden `now`'a göre yeniden seçilir. Liste yoksa
 * (eski snapshot) donmuş `currentBlock`/`nextBlock` alanlarına düşülür.
 */
export function resolveWidgetNow(snapshot: WidgetSnapshot, now: Date = new Date()): WidgetNow {
  const stale = snapshot.date !== '' && snapshot.date !== toDateString(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()

  if (stale) {
    return {
      currentBlock: null,
      nextBlock: null,
      dayOver: false,
      progress: 0,
      remainingMinutes: 0,
      minutesUntilStart: 0,
      stale: true,
    }
  }

  // Depodaki eski snapshot'larda `blocks` alanı hiç olmayabilir
  const blocks = snapshot.blocks ?? []

  if (blocks.length === 0) {
    // Eski sürümden kalan snapshot — donmuş alanlarla idare et
    const current = snapshot.currentBlock
    return {
      currentBlock: current,
      nextBlock: snapshot.nextBlock,
      dayOver: snapshot.dayOver,
      progress: current?.progress ?? 0,
      remainingMinutes: current?.remainingMinutes ?? 0,
      minutesUntilStart: snapshot.nextBlock?.minutesUntilStart ?? 0,
      stale: false,
    }
  }

  let current: WidgetBlock | null = null
  let next: WidgetBlock | null = null
  let progress = 0
  let remainingMinutes = 0
  let minutesUntilStart = 0

  for (const block of blocks) {
    const start = clockToMinutes(block.startTime)
    const rawEnd = clockToMinutes(block.endTime)
    if (start === null || rawEnd === null) continue
    // Gece yarısını geçen blok (23:30–00:15) gün sonuna kadar sayılır
    const end = rawEnd <= start ? 1440 : rawEnd

    if (nowMin >= start && nowMin < end) {
      current = block
      const duration = Math.max(1, end - start)
      progress = (nowMin - start) / duration
      remainingMinutes = end - nowMin
    } else if (nowMin < start && next === null) {
      next = block
      minutesUntilStart = start - nowMin
    }
  }

  return {
    currentBlock: current,
    nextBlock: next,
    dayOver: current === null && next === null,
    progress,
    remainingMinutes,
    minutesUntilStart,
    stale: false,
  }
}

/** minutesToClock re-export — widget katmanı schedule'a ayrıca bağlanmasın */
export { minutesToClock }
