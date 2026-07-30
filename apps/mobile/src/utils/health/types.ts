import type { HealthDailyInput } from '@lifeos/shared'

/**
 * Bir günün okuma penceresi. Yerel saate göre hesaplanır — UTC ile hesaplamak
 * UTC+3'te günü 3 saat kaydırıyor ve akşam adımları yarına yazılıyordu.
 */
export interface DayRange {
  /** 'YYYY-MM-DD' — kaydın yazılacağı takvim günü */
  date: string
  /** Günün yerel 00:00'ı */
  start: Date
  /** Günün yerel 23:59:59.999'u (bugün için: şu an) */
  end: Date
  /**
   * Uyku aramasının başlangıcı — bir önceki akşam 18:00.
   * Gece yarısından önce başlayan uykuyu kaçırmamak için gün başından geriye gider.
   */
  sleepWindowStart: Date
}

export type HealthReadFailure = 'unavailable' | 'denied' | 'not_installed'

export type HealthReadResult =
  | { ok: true; metrics: HealthDailyInput }
  | { ok: false; reason: HealthReadFailure }

/** Platform bağımsız okuyucu arayüzü */
export interface HealthReader {
  isAvailable: () => Promise<boolean>
  requestPermissions: () => Promise<boolean>
  readDay: (range: DayRange) => Promise<HealthReadResult>
}

/**
 * Verilen takvim gününün yerel pencereleri.
 * Bugün için `end` şimdiki an — ileriye dönük sorgu HealthKit'te boş dönüyor.
 */
export function buildDayRange(date: string, now: Date = new Date()): DayRange {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const start = new Date(year, month - 1, day, 0, 0, 0, 0)

  const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999)
  const end = endOfDay > now ? now : endOfDay

  const sleepWindowStart = new Date(start)
  sleepWindowStart.setDate(sleepWindowStart.getDate() - 1)
  sleepWindowStart.setHours(18, 0, 0, 0)

  return { date, start, end, sleepWindowStart }
}
