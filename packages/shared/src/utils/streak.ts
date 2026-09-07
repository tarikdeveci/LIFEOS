/**
 * Antrenman serisi.
 *
 * Birim GÜN değil HAFTA. Spor için gün serisi yanlış ölçü: dinlenme günü
 * programın parçasıdır, salı gitmeyen biri seriyi bozmuş sayılmaz. Haftalık
 * ölçüde "her hafta en az bir kez gittim" korunuyor ve kullanıcının programı
 * haftada 2 de olsa 5 de olsa aynı şekilde çalışıyor.
 *
 * Hafta Pazartesi başlar (`weekStart` ile aynı kural).
 */

import { fromDateString, todayDate, toDateString, weekStart } from './date'

export interface WorkoutStreak {
  /** Kesintisiz hafta sayısı — içinde bulunulan hafta dahil (antrenman varsa). */
  weeks: number
  /** Bu hafta tamamlanan antrenman sayısı. */
  thisWeekCount: number
  /** Şimdiye kadarki en uzun hafta serisi. */
  bestWeeks: number
  /** Son tamamlanan antrenmanın tarihi. */
  lastWorkoutDate: string | null
  /**
   * Seri sürüyor ama bu hafta henüz antrenman yok — hatırlatma tam da bu
   * durumda anlamlı. Seri sıfırken uyarmak kimseyi motive etmiyor.
   */
  atRisk: boolean
}

/** Tarihin ait olduğu haftanın Pazartesi'si, 'YYYY-MM-DD'. */
export function weekKey(dateStr: string): string {
  return toDateString(weekStart(fromDateString(dateStr)))
}

/** `weeks` hafta önceki haftanın anahtarı. */
function shiftWeek(key: string, weeksBack: number): string {
  const d = fromDateString(key)
  d.setDate(d.getDate() - weeksBack * 7)
  return toDateString(d)
}

/**
 * Tamamlanmış antrenman tarihlerinden seriyi çıkarır.
 *
 * Girdi ham tarih listesi: çağıran taraf `status = 'completed'` filtresini
 * kendisi uygular, böylece fonksiyon veritabanı şemasından bağımsız kalır ve
 * hem uygulamada hem edge function'da aynı sonucu verir.
 *
 * İçinde bulunulan hafta boşsa seri HENÜZ bozulmaz — hafta bitene kadar
 * kullanıcının şansı var. Bu yüzden sayım bu haftada antrenman varsa bu
 * haftadan, yoksa geçen haftadan geriye doğru yürür.
 */
export function computeWorkoutStreak(dates: string[], today: string = todayDate()): WorkoutStreak {
  const empty: WorkoutStreak = {
    weeks: 0,
    thisWeekCount: 0,
    bestWeeks: 0,
    lastWorkoutDate: null,
    atRisk: false,
  }
  if (dates.length === 0) return empty

  const currentWeek = weekKey(today)
  const counts = new Map<string, number>()
  let lastWorkoutDate: string | null = null

  for (const date of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    // Gelecek tarihli (planlanmış ama işaretlenmiş) kayıt seriyi şişirmesin
    if (date > today) continue
    const key = weekKey(date)
    counts.set(key, (counts.get(key) ?? 0) + 1)
    if (lastWorkoutDate === null || date > lastWorkoutDate) lastWorkoutDate = date
  }
  if (counts.size === 0) return empty

  const thisWeekCount = counts.get(currentWeek) ?? 0

  let weeks = 0
  let cursor = thisWeekCount > 0 ? currentWeek : shiftWeek(currentWeek, 1)
  while (counts.has(cursor)) {
    weeks += 1
    cursor = shiftWeek(cursor, 1)
  }

  // En iyi seri: dolu haftaları sıraya dizip ardışık olanları say
  const orderedWeeks = [...counts.keys()].sort()
  let bestWeeks = 0
  let run = 0
  let previous: string | null = null
  for (const key of orderedWeeks) {
    run = previous !== null && shiftWeek(key, 1) === previous ? run + 1 : 1
    if (run > bestWeeks) bestWeeks = run
    previous = key
  }

  return {
    weeks,
    thisWeekCount,
    bestWeeks: Math.max(bestWeeks, weeks),
    lastWorkoutDate,
    atRisk: weeks > 0 && thisWeekCount === 0,
  }
}

/**
 * Seri için kullanıcıya gösterilecek metin.
 *
 * Bildirimde ve ekranda aynı cümle kullanılıyor ki iki yer birbirini
 * yalanlamasın. `null` dönerse söylenecek bir şey yok — 1 haftalık "seri"
 * seri değildir, onu kutlamak sayıyı değersizleştirir.
 */
export function streakMessage(streak: WorkoutStreak): { title: string; body: string } | null {
  if (streak.weeks < 2) return null

  if (streak.atRisk) {
    return {
      title: `${streak.weeks} haftalık serin tehlikede`,
      body: 'Bu hafta henüz antrenman yok. Kısa bir seans bile seriyi ayakta tutar.',
    }
  }

  return {
    title: `${streak.weeks} haftadır aralıksız`,
    body:
      streak.weeks >= streak.bestWeeks
        ? 'Bu senin en uzun serin. Bozma.'
        : `En uzun serin ${streak.bestWeeks} hafta. Serini bozma.`,
  }
}
