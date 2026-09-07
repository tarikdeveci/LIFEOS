// Haftalık antrenman serisi — edge function tarafı.
//
// Aynı kural `packages/shared/src/utils/streak.ts` içinde de var. Edge
// function'lar Deno'da çalışıyor ve pnpm workspace paketlerini içe aktaramıyor,
// bu yüzden hesap iki yerde duruyor. Kopyanın küçük kalması bilinçli: burada
// yalnızca bildirimi kurmak için gereken iki alan üretiliyor (`weeks`,
// `atRisk`), en uzun seri gibi ekranlık ayrıntılar taşınmadı.
//
// Kural: hafta Pazartesi başlar, bir haftada en az bir tamamlanmış antrenman
// varsa o hafta seriye dahildir. İçinde bulunulan hafta boşsa seri henüz
// bozulmaz — hafta bitene kadar kullanıcının hakkı vardır.

/** 'YYYY-MM-DD' → ait olduğu haftanın Pazartesi'si, aynı biçimde. */
export function weekKeyUtc(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day))
  return d.toISOString().slice(0, 10)
}

function shiftWeekUtc(key: string, weeksBack: number): string {
  const d = new Date(`${key}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - weeksBack * 7)
  return d.toISOString().slice(0, 10)
}

export interface StreakSummary {
  weeks: number
  thisWeekCount: number
  atRisk: boolean
}

export function computeStreak(dates: string[], today: string): StreakSummary {
  const currentWeek = weekKeyUtc(today)
  const weeksWithWorkout = new Set<string>()
  let thisWeekCount = 0

  for (const date of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) continue
    const key = weekKeyUtc(date)
    weeksWithWorkout.add(key)
    if (key === currentWeek) thisWeekCount += 1
  }

  let weeks = 0
  let cursor = thisWeekCount > 0 ? currentWeek : shiftWeekUtc(currentWeek, 1)
  while (weeksWithWorkout.has(cursor)) {
    weeks += 1
    cursor = shiftWeekUtc(cursor, 1)
  }

  return { weeks, thisWeekCount, atRisk: weeks > 0 && thisWeekCount === 0 }
}

/**
 * Bildirime eklenecek kısa cümle; söylenecek bir şey yoksa null.
 *
 * İki haftanın altındaki "seri" duyurulmuyor: her yeni kullanıcıya rozet
 * göstermek sayıyı değersizleştiriyor.
 */
export function streakLine(streak: StreakSummary): string | null {
  if (streak.weeks < 2) return null
  return streak.atRisk
    ? `${streak.weeks} haftalık serin tehlikede — bu hafta henüz antrenman yok.`
    : `${streak.weeks} haftadır aralıksız spordasın, serini bozma. 🔥`
}
