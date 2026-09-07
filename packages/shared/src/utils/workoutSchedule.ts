/**
 * Antrenman programını takvime yerleştirme aritmetiği.
 *
 * Saf fonksiyonlar: hangi program gününün hangi takvim gününe, saat kaçta ve
 * kaç dakika olarak düşeceğini hesaplar. Yazma işini yapmaz — `time_blocks`
 * satırını da cihaz takvimi etkinliğini de çağıran taraf oluşturur, ikisi de
 * buradan gelen aynı tarih/saat listesini kullanır ki iki hedef birbirinden
 * kaymasın.
 *
 * Hafta günü gösterimi her yerde JS uyumlu: 0 = Pazar … 6 = Cumartesi.
 * `time_blocks.recurrence_days` de bu düzeni kullanıyor.
 */

import { addMinutesToClock, fromDateString, parseClockParts, shiftIsoDate } from './date'

/** Pazartesi ilk sırada olacak şekilde kısa Türkçe gün adları, JS indeksiyle. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const
export const WEEKDAY_SHORT: Record<number, string> = {
  1: 'Pzt', 2: 'Sal', 3: 'Çar', 4: 'Per', 5: 'Cum', 6: 'Cmt', 0: 'Paz',
}

export interface SchedulableExercise {
  sets: number
  rest_seconds: number
}

/**
 * N antrenman gününü haftaya eşit aralıklarla dağıtır.
 *
 * 3 gün → Pzt/Çar/Cum, 2 gün → Pzt/Per. Kullanıcı sonradan değiştirebiliyor;
 * buradaki tek amaç makul bir başlangıç vermek, çünkü boş bir gün seçicisiyle
 * karşılaşan kişi programı hiç planlamıyor.
 */
export function spreadWeekdays(dayCount: number): number[] {
  if (dayCount <= 0) return []
  const count = Math.min(dayCount, 7)
  const picked: number[] = []
  for (let i = 0; i < count; i += 1) {
    const offsetFromMonday = Math.floor((i * 7) / count)
    picked.push(WEEKDAY_ORDER[offsetFromMonday] ?? 1)
  }
  return picked
}

/**
 * Bir antrenman gününün tahmini süresi (dakika).
 *
 * Set başına ~45 sn iş + hareketin kendi dinlenme süresi, üstüne 8 dk ısınma.
 * Kaba ama takvimde 1 saatlik sabit blok koymaktan çok daha iyi: 20 setlik
 * bacak günüyle 9 setlik kol günü aynı yeri kaplamıyor.
 */
export function estimateWorkoutMinutes(exercises: SchedulableExercise[]): number {
  const seconds = exercises.reduce((sum, ex) => {
    const sets = Math.min(12, Math.max(1, ex.sets || 3))
    const rest = Math.min(300, Math.max(20, ex.rest_seconds || 60))
    return sum + sets * (45 + rest)
  }, 0)

  const minutes = 8 + seconds / 60
  const rounded = Math.round(minutes / 5) * 5
  return Math.min(150, Math.max(20, rounded))
}

/** `fromDate` dahil, verilen hafta gününe denk gelen ilk tarih. */
export function nextDateForWeekday(fromDate: string, weekday: number): string {
  const start = fromDateString(fromDate)
  const delta = (weekday - start.getDay() + 7) % 7
  return delta === 0 ? fromDate : shiftIsoDate(fromDate, delta)
}

/** Aynı hafta gününün `weeks` hafta boyunca düştüğü tarihler. */
export function weeklyDates(fromDate: string, weekday: number, weeks: number): string[] {
  const first = nextDateForWeekday(fromDate, weekday)
  const total = Math.min(52, Math.max(1, weeks))
  return Array.from({ length: total }, (_, i) => shiftIsoDate(first, i * 7))
}

/** 'YYYY-MM-DD' + 'HH:MM' → yerel saat diliminde Date. */
export function localDateTime(date: string, time: string): Date {
  const { h, m } = parseClockParts(time)
  const base = fromDateString(date)
  base.setHours(h, m, 0, 0)
  return base
}

export interface PlannedSession {
  /** Program gününün kimliği — hangi günün planlandığını çağıran taraf bilir. */
  dayId: string
  dayName: string
  weekday: number
  durationMinutes: number
  startTime: string
  endTime: string
  /** Bu günün düştüğü tüm tarihler (hafta sayısı kadar). */
  dates: string[]
}

export interface PlanProgramInput {
  days: Array<{ id: string; day_name: string; exercises: SchedulableExercise[] }>
  /** Gün kimliği → hafta günü (0-6). Eksik kalanlar `spreadWeekdays` ile doldurulur. */
  weekdayByDay: Record<string, number>
  startDate: string
  startTime: string
  weeks: number
}

/**
 * Programın tamamını somut oturumlara çevirir.
 *
 * Tarih üretimi tek yerde toplandı: haftalık plan blokları ve cihaz takvimi
 * etkinlikleri aynı listeden besleniyor. İki tarafın kendi tarihini hesapladığı
 * bir sürümde yaz saati geçişinde bir hafta kayma riski vardı.
 */
export function planProgram(input: PlanProgramInput): PlannedSession[] {
  const fallback = spreadWeekdays(input.days.length)

  return input.days.map((day, index) => {
    const weekday = input.weekdayByDay[day.id] ?? fallback[index] ?? 1
    const durationMinutes = estimateWorkoutMinutes(day.exercises)
    return {
      dayId: day.id,
      dayName: day.day_name,
      weekday,
      durationMinutes,
      startTime: input.startTime,
      endTime: addMinutesToClock(input.startTime, durationMinutes),
      dates: weeklyDates(input.startDate, weekday, input.weeks),
    }
  })
}
