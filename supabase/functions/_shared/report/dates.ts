// Gün ve saat dilimi yardımcıları. Deno ya da npm importu yok: Node ile test edilir.
//
// Sunucu UTC'de çalışır. Gün hesabı her zaman kullanıcının timezone'uyla yapılır:
// new Date().getHours() ve toISOString() gün sınırında yanlış günü verir
// (İstanbul'da 01:00'de UTC tarihi hâlâ dünü gösterir).

import { weekKeyUtc } from '../streak.ts'

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function dateParts(date: string): [number, number, number] | null {
  const m = ISO_DATE.exec(date)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** 'YYYY-MM-DD' biçiminde ve takvimde gerçekten var olan gün (2026-02-30 geçmez). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const p = dateParts(value)
  if (!p) return false
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]))
  return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2]
}

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value === '') return false
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: value })
    return true
  } catch {
    return false
  }
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Gün numarası: metin havuzlarında "güne göre dönen" seçimin tohumu. */
export function dayIndex(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000)
}

/** Haftanın Pazartesi'si ('YYYY-MM-DD'). */
export function mondayOf(date: string): string {
  return weekKeyUtc(date)
}

/** Kullanıcının saat diliminde şu anki tarih. Dilim geçerli olmalı (isValidTimeZone). */
export function localDateIn(timeZone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** Anın verilen dilimdeki duvar saati, UTC olarak okunmuş (saniye hassasiyetinde). */
function wallClockUtc(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant))
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'))
}

/** Yerel günün başlangıcı (UTC ms). İkinci geçiş, yaz saati sınırındaki ofset kaymasını düzeltir. */
function zonedMidnight(date: string, timeZone: string): number {
  const p = dateParts(date)
  if (!p) throw new RangeError(`gecersiz tarih: ${date}`)
  const wall = Date.UTC(p[0], p[1] - 1, p[2])
  const offsetAt = (instant: number) => {
    const t = Math.floor(instant / 1000) * 1000
    return wallClockUtc(t, timeZone) - t
  }
  const first = wall - offsetAt(wall)
  return wall - offsetAt(first)
}

/** Yerel günün [başlangıç, bitiş) aralığı, ISO UTC. Zaman damgalı satırları güne bağlamak için. */
export function dayBoundsUtc(date: string, timeZone: string): { start: string; end: string } {
  return {
    start: new Date(zonedMidnight(date, timeZone)).toISOString(),
    end: new Date(zonedMidnight(shiftDate(date, 1), timeZone)).toISOString(),
  }
}

export type ReportDateCheck =
  | { ok: true; date: string }
  | { ok: false; reason: 'future' | 'too_old' }

/**
 * İstenen rapor gününü kullanıcının bugününe göre doğrular. Cihaz saat dilimi sunucunun
 * bildiğinden ileride olabilir: bir gün ilerisi hata değil, bugüne sıkıştırılır. Daha
 * ilerisi 'future', `maxAgeDays`'ten eskisi 'too_old'.
 */
export function resolveReportDate(requested: string, today: string, maxAgeDays: number): ReportDateCheck {
  if (requested > shiftDate(today, 1)) return { ok: false, reason: 'future' }
  const date = requested > today ? today : requested
  if (date < shiftDate(today, -maxAgeDays)) return { ok: false, reason: 'too_old' }
  return { ok: true, date }
}
