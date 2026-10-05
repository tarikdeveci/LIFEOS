/**
 * Günlük plan hesapları: kapasite, otomatik yerleştirme, "kalanı kaydır".
 * AI yok: hepsi saf ve belirlenimci, web ve mobil paylaşır.
 *
 * Tüm saatler gün içi dakikaya (0-1440) indirgenir. Blok saatleri Postgres TIME
 * ('HH:MM' veya 'HH:MM:SS') olarak gelir.
 */

import { clockToMinutes, minutesToClock } from './schedule'

/** Süresi girilmemiş görev için varsayılan dakika. */
export const DEFAULT_TASK_MINUTES = 30

/** ai-suggest ile aynı çalışma aralığı. */
export const DEFAULT_WORKDAY = { start: '08:00', end: '22:00' } as const

export interface Interval { start: number; end: number }

interface BlockLike { start_time: string; end_time: string }
interface BlockWithState extends BlockLike { id: string; completed_at: string | null }
interface TaskLike { id: string; estimated_minutes: number | null; priority_score: number }

export function taskMinutes(task: { estimated_minutes: number | null }): number {
  return task.estimated_minutes && task.estimated_minutes > 0 ? task.estimated_minutes : DEFAULT_TASK_MINUTES
}

function toInterval(b: BlockLike): Interval {
  const start = clockToMinutes(b.start_time)
  const rawEnd = clockToMinutes(b.end_time)
  // Gece yarısını aşan blok (end <= start) gün sonuna sabitlenir.
  return { start, end: rawEnd > start ? rawEnd : 1440 }
}

/** Çakışan aralıkları birleştirir, başlangıca göre sıralı döner. */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start)
  const out: Interval[] = []
  for (const i of sorted) {
    const last = out[out.length - 1]
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end)
    else out.push({ ...i })
  }
  return out
}

/** `from` aralıklarından `cut` ile kesişen kısımları çıkarır; kalan parçalar sıralı döner. */
export function subtractIntervals(from: readonly Interval[], cut: readonly Interval[]): Interval[] {
  const cuts = mergeIntervals(cut)
  const out: Interval[] = []
  for (const f of mergeIntervals(from)) {
    let cursor = f.start
    for (const c of cuts) {
      if (c.end <= cursor) continue
      if (c.start >= f.end) break
      if (c.start > cursor) out.push({ start: cursor, end: c.start })
      cursor = Math.max(cursor, c.end)
    }
    if (cursor < f.end) out.push({ start: cursor, end: f.end })
  }
  return out
}

/**
 * Bir bloğun cihaz takvimindeki ikizi olan etkinlikleri eler. Antrenman programı aynı seansı hem
 * blok hem takvim etkinliği olarak yazabiliyor; takvim geri okununca gün iki kez görünüyordu.
 * İkiz: başlığı bloğun etiketiyle aynı ve saati blokla kesişen etkinlik. Yalnızca başlığa bakmak
 * aynı adlı ama başka saatteki gerçek etkinliği de gizlerdi.
 */
export function dropBlockMirrors<E extends Interval & { title: string }>(
  events: readonly E[],
  blocks: readonly (BlockLike & { label: string | null })[],
): E[] {
  const labelled = blocks.flatMap((b) => {
    const label = b.label?.trim()
    return label ? [{ label, ...toInterval(b) }] : []
  })
  return events.filter((e) => {
    const title = e.title.trim()
    // Gece yarısını aşan etkinlik de blok gibi gün sonuna sabitlenir.
    const end = e.end > e.start ? e.end : 1440
    return !labelled.some((b) => b.label === title && b.start < end && e.start < b.end)
  })
}

/**
 * [dayStart, dayEnd] içinde bloklar ve dış meşgul aralıklar (ör. Google takvimi)
 * dışında kalan boşluklar. `from` verilirse ondan önceki kısım kesilir (şu an).
 */
export function freeIntervals(
  blocks: readonly BlockLike[],
  opts: { dayStart?: string; dayEnd?: string; from?: number; busy?: readonly Interval[] } = {},
): Interval[] {
  const dayStart = clockToMinutes(opts.dayStart ?? DEFAULT_WORKDAY.start)
  const dayEnd = clockToMinutes(opts.dayEnd ?? DEFAULT_WORKDAY.end)
  let cursor = Math.max(dayStart, opts.from ?? dayStart)
  const taken = mergeIntervals([...blocks.map(toInterval), ...(opts.busy ?? [])])
  const free: Interval[] = []
  for (const t of taken) {
    if (t.end <= cursor) continue
    if (t.start >= dayEnd) break
    if (t.start > cursor) free.push({ start: cursor, end: Math.min(t.start, dayEnd) })
    cursor = Math.max(cursor, t.end)
  }
  if (cursor < dayEnd) free.push({ start: cursor, end: dayEnd })
  return free
}

export interface DayCapacity {
  /** Görevlere kalan dakika (çalışma saatleri eksi bloklar eksi meşgul). */
  availableMinutes: number
  /** Bugünkü bloklanmamış görevlerin toplam süresi. */
  plannedMinutes: number
  /** plannedMinutes / availableMinutes; müsait süre yoksa ve görev varsa Infinity. */
  ratio: number
  overloaded: boolean
}

export function dayCapacity(
  tasks: readonly { estimated_minutes: number | null }[],
  blocks: readonly BlockLike[],
  opts: { dayStart?: string; dayEnd?: string; from?: number; busy?: readonly Interval[] } = {},
): DayCapacity {
  const availableMinutes = freeIntervals(blocks, opts).reduce((s, i) => s + i.end - i.start, 0)
  const plannedMinutes = tasks.reduce((s, t) => s + taskMinutes(t), 0)
  const ratio = availableMinutes > 0 ? plannedMinutes / availableMinutes : plannedMinutes > 0 ? Infinity : 0
  return { availableMinutes, plannedMinutes, ratio, overloaded: plannedMinutes > availableMinutes }
}

export interface Placement { task_id: string; start_time: string; end_time: string }

/**
 * Otomatik yerleştir: görevleri priority_score sırasıyla (eşitlikte kısa olan önce)
 * ilk sığdıkları boşluğa koyar. Açgözlü; sığmayanlar `unplaced`'ta döner.
 * `gap` görevler arasına bırakılan nefes payı (dakika).
 */
export function autoPlace<T extends TaskLike>(
  tasks: readonly T[],
  blocks: readonly BlockLike[],
  opts: { dayStart?: string; dayEnd?: string; from?: number; busy?: readonly Interval[]; gap?: number } = {},
): { placements: Placement[]; unplaced: T[] } {
  const gap = opts.gap ?? 0
  const free = freeIntervals(blocks, opts)
  const ordered = [...tasks].sort((a, b) => b.priority_score - a.priority_score || taskMinutes(a) - taskMinutes(b))
  const placements: Placement[] = []
  const unplaced: T[] = []

  for (const task of ordered) {
    const need = taskMinutes(task)
    const slot = free.find((i) => i.end - i.start >= need)
    if (!slot) { unplaced.push(task); continue }
    placements.push({ task_id: task.id, start_time: minutesToClock(slot.start), end_time: minutesToClock(slot.start + need) })
    slot.start = Math.min(slot.end, slot.start + need + gap)
  }
  return { placements, unplaced }
}

export interface ShiftResult {
  updates: { id: string; start_time: string; end_time: string }[]
  /** Kaydırılınca gece yarısını aşacak bloklar: dokunulmaz, kullanıcı karar verir. */
  overflow: string[]
  /** Son kaydırılan bloğun bitişi dayEnd'i aşıyor mu (uyarı için). */
  pastDayEnd: boolean
}

/**
 * "N dk geciktim": şu an bitmemiş, tamamlanmamış blokları zincirleme kaydırır.
 * İlk blok N dakika ileri gider; sonrakiler ancak öncekiyle çakışırsa itilir,
 * yani aradaki boşluklar gecikmeyi emer. Süreler korunur.
 */
export function shiftRemaining(
  blocks: readonly BlockWithState[],
  delayMinutes: number,
  now: number,
  dayEnd: string = DEFAULT_WORKDAY.end,
): ShiftResult {
  const endLimit = clockToMinutes(dayEnd)
  const pending = blocks
    .filter((b) => !b.completed_at)
    .map((b) => ({ b, ...toInterval(b) }))
    .filter((x) => x.end > now)
    .sort((a, b) => a.start - b.start)

  const updates: ShiftResult['updates'] = []
  const overflow: string[] = []
  let prevEnd = -1
  let pastDayEnd = false

  pending.forEach((x, idx) => {
    const duration = x.end - x.start
    const start = idx === 0 ? x.start + delayMinutes : Math.max(x.start, prevEnd)
    const end = start + duration
    if (end > 1440) { overflow.push(x.b.id); prevEnd = Math.max(prevEnd, x.end); return }
    if (end > endLimit) pastDayEnd = true
    prevEnd = end
    if (start !== x.start) updates.push({ id: x.b.id, start_time: minutesToClock(start), end_time: minutesToClock(end) })
  })
  return { updates, overflow, pastDayEnd }
}

/**
 * Google dolu/boş aralıklarını (timestamptz) verilen yerel günün dakikalarına indirger.
 * Güne taşan kısım kırpılır. Cihaz saat dilimi kullanıcınınkiyle aynı varsayılır.
 * Dakikalar duvar saatinden okunur: yaz saati geçişi olan günde gece yarısından geçen gerçek
 * süre saatle bir saat kayıyor, 09:00 toplantısı 10:00'da görünüyordu.
 */
export function busyToIntervals(rows: readonly { starts_at: string; ends_at: string }[], date: string): Interval[] {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const dayStart = new Date(y, m - 1, d).getTime()
  const dayEnd = new Date(y, m - 1, d + 1).getTime()
  const wall = (ms: number) => { const t = new Date(ms); return t.getHours() * 60 + t.getMinutes() }
  const out: Interval[] = []
  for (const r of rows) {
    const s = Math.max(new Date(r.starts_at).getTime(), dayStart)
    const e = Math.min(new Date(r.ends_at).getTime(), dayEnd)
    if (e > s) out.push({ start: s === dayStart ? 0 : wall(s), end: e === dayEnd ? 1440 : wall(e) })
  }
  return mergeIntervals(out.filter((i) => i.end > i.start))
}
