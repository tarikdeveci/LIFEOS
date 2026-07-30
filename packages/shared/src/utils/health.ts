/**
 * Sağlık verisini anlamlı hale getiren saf fonksiyonlar.
 *
 * Cihazdan gelen ham sayılar (adım, kalori, uyku dakikası, nabız) tek başına
 * bir şey söylemez; burada hedefe göre ilerlemeye, enerji önerisine, kalori
 * bütçesine ve toparlanma sinyaline çevrilir.
 *
 * Tüm girdiler `null` olabilir — cihaz o metriği hiç üretmemiş olabilir.
 * "Veri yok" ile "sıfır" farklıdır ve burada karıştırılmaz.
 */

import type { HealthDaily } from '../types/health'
import type { ActivityLevel } from './nutrition'

export interface GoalProgress {
  /** 0-1 arası, hedefi aşsa bile 1'de kırpılır */
  progress: number
  /** Kırpılmamış oran — hedefin %140'ı gibi durumları göstermek için */
  ratio: number
  reached: boolean
  /** Hedefe kalan miktar; hedef aşıldıysa 0 */
  remaining: number
}

export function goalProgress(value: number | null, goal: number): GoalProgress | null {
  if (value === null || !Number.isFinite(value) || goal <= 0) return null
  const ratio = value / goal
  return {
    progress: Math.min(1, ratio),
    ratio,
    reached: value >= goal,
    remaining: Math.max(0, Math.round(goal - value)),
  }
}

/**
 * Uyku süresinden 1-5 enerji seviyesi önerir (daily_plans.energy_level ile aynı ölçek).
 *
 * Heuristik: hedefe oranla hesaplanır. Çok uzun uyku da tam puan almaz —
 * aşırı uyku genelde dinlenmişlik değil borç kapatma işaretidir.
 */
export function energyFromSleep(sleepMinutes: number | null, goalMinutes: number): 1 | 2 | 3 | 4 | 5 | null {
  if (sleepMinutes === null || sleepMinutes <= 0 || goalMinutes <= 0) return null
  const ratio = sleepMinutes / goalMinutes

  if (ratio < 0.6) return 1
  if (ratio < 0.75) return 2
  if (ratio < 0.9) return 3
  if (ratio > 1.4) return 4
  if (ratio < 1.05) return 4
  return 5
}

export interface CalorieBudget {
  /** Yenebilecek toplam kalori */
  budget: number
  /** Aktiviteden gelen ekstra (kapalıysa 0) */
  bonus: number
}

/**
 * Aktif kaloriyi yemek bütçesine ekler ("yediğin - yaktığın" mantığı).
 *
 * Kapalıyken hedef aynen döner. Açıkken bile aktif kalori null ise bonus 0'dır —
 * veri gelmediği gün bütçe sessizce şişmez.
 */
export function calorieBudget(
  targetCalories: number,
  activeEnergyKcal: number | null,
  addToBudget: boolean,
): CalorieBudget {
  if (!addToBudget || activeEnergyKcal === null || activeEnergyKcal <= 0) {
    return { budget: Math.round(targetCalories), bonus: 0 }
  }
  const bonus = Math.round(activeEnergyKcal)
  return { budget: Math.round(targetCalories) + bonus, bonus }
}

export type RecoveryStatus = 'good' | 'elevated' | 'unknown'

export interface RecoverySignal {
  status: RecoveryStatus
  /** Son 7 günün dinlenme nabzı ortalaması (bugün hariç) */
  baseline: number | null
  /** Bugünün ortalamadan farkı (bpm); baseline yoksa null */
  deltaBpm: number | null
}

/**
 * Dinlenme nabzını kendi taban çizgisiyle karşılaştırır.
 *
 * Mutlak eşik kullanmak anlamsız — 48 bpm bir koşucu için normal, 48'e alışkın
 * biri için 56 yüksektir. Taban çizgisi kişinin kendi son günleri.
 * 3 günden az geçmiş veri varsa yorum yapılmaz.
 */
export function recoverySignal(days: HealthDaily[], today: string): RecoverySignal {
  const todayHr = days.find((d) => d.date === today)?.resting_heart_rate ?? null

  const history = days
    .filter((d) => d.date < today && d.resting_heart_rate !== null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 7)
    .map((d) => d.resting_heart_rate as number)

  if (history.length < 3) return { status: 'unknown', baseline: null, deltaBpm: null }

  const baseline = history.reduce((sum, hr) => sum + hr, 0) / history.length
  if (todayHr === null) {
    return { status: 'unknown', baseline: Math.round(baseline * 10) / 10, deltaBpm: null }
  }

  const deltaBpm = Math.round((todayHr - baseline) * 10) / 10
  // +4 bpm veya %6 — hangisi büyükse. Küçük dalgalanmalar uyarı üretmesin.
  const threshold = Math.max(4, baseline * 0.06)

  return {
    status: deltaBpm >= threshold ? 'elevated' : 'good',
    baseline: Math.round(baseline * 10) / 10,
    deltaBpm,
  }
}

/**
 * Ortalama adımdan TDEE için aktivite seviyesi önerir.
 * Profildeki elle seçilen seviyeyi ezmek için değil, "gerçekte şu kadar
 * hareket ediyorsun" önerisi göstermek için.
 */
export function activityLevelFromSteps(averageSteps: number | null): ActivityLevel | null {
  if (averageSteps === null || averageSteps <= 0) return null
  if (averageSteps < 5000) return 'sedentary'
  if (averageSteps < 7500) return 'lightly_active'
  if (averageSteps < 10000) return 'moderately_active'
  if (averageSteps < 12500) return 'very_active'
  return 'extra_active'
}

export interface HealthWeekSummary {
  /** Veri bulunan gün sayısı */
  dayCount: number
  totalSteps: number
  averageSteps: number | null
  totalDistanceKm: number
  totalActiveEnergyKcal: number
  averageSleepMinutes: number | null
  averageRestingHeartRate: number | null
  totalWorkouts: number
  /** Adım trendi: ilk yarı vs ikinci yarı ortalaması */
  stepTrend: 'up' | 'down' | 'flat' | 'unknown'
}

/** Bir metrik için null'ları atlayan ortalama */
function averageOf(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v))
  if (present.length === 0) return null
  return present.reduce((sum, v) => sum + v, 0) / present.length
}

function sumOf(values: Array<number | null>): number {
  return values.reduce<number>((sum, v) => sum + (v ?? 0), 0)
}

/**
 * Gün listesini haftalık özete indirger. Liste sıralı olmak zorunda değil.
 */
export function summarizeHealthDays(days: HealthDaily[]): HealthWeekSummary {
  const sorted = days.slice().sort((a, b) => a.date.localeCompare(b.date))
  const steps = sorted.map((d) => d.steps)
  const averageSteps = averageOf(steps)

  // Trend: günleri ikiye bölüp ortalama karşılaştır. 4 günden azsa yorum yok.
  let stepTrend: HealthWeekSummary['stepTrend'] = 'unknown'
  if (sorted.length >= 4) {
    const mid = Math.floor(sorted.length / 2)
    const firstHalf = averageOf(sorted.slice(0, mid).map((d) => d.steps))
    const secondHalf = averageOf(sorted.slice(mid).map((d) => d.steps))
    if (firstHalf !== null && secondHalf !== null && firstHalf > 0) {
      const change = (secondHalf - firstHalf) / firstHalf
      stepTrend = change > 0.1 ? 'up' : change < -0.1 ? 'down' : 'flat'
    }
  }

  return {
    dayCount: sorted.length,
    totalSteps: Math.round(sumOf(steps)),
    averageSteps: averageSteps === null ? null : Math.round(averageSteps),
    totalDistanceKm: Math.round((sumOf(sorted.map((d) => d.distance_m)) / 1000) * 10) / 10,
    totalActiveEnergyKcal: Math.round(sumOf(sorted.map((d) => d.active_energy_kcal))),
    averageSleepMinutes: roundOrNull(averageOf(sorted.map((d) => d.sleep_minutes))),
    averageRestingHeartRate: roundOrNull(averageOf(sorted.map((d) => d.resting_heart_rate)), 1),
    totalWorkouts: Math.round(sumOf(sorted.map((d) => d.workout_count))),
    stepTrend,
  }
}

function roundOrNull(value: number | null, decimals = 0): number | null {
  if (value === null) return null
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

// ============================
// Görüntüleme yardımcıları
// ============================

/** 8342 → '8.342' (tr) / '8,342' (en) */
export function formatSteps(steps: number | null, lang: 'tr' | 'en' = 'tr'): string {
  if (steps === null) return '–'
  return new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US').format(Math.round(steps))
}

/** 5420 m → '5,4 km'; 1 km altında metre gösterir */
export function formatDistance(meters: number | null, lang: 'tr' | 'en' = 'tr'): string {
  if (meters === null) return '–'
  if (meters < 1000) return `${Math.round(meters)} m`
  const km = meters / 1000
  const formatted = new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
    maximumFractionDigits: 1,
  }).format(km)
  return `${formatted} km`
}

/** 452 → '7s 32d' (tr) / '7h 32m' (en) */
export function formatSleepDuration(minutes: number | null, lang: 'tr' | 'en' = 'tr'): string {
  if (minutes === null || minutes <= 0) return '–'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  const hourUnit = lang === 'tr' ? 's' : 'h'
  const minuteUnit = lang === 'tr' ? 'd' : 'm'
  if (h === 0) return `${m}${minuteUnit}`
  if (m === 0) return `${h}${hourUnit}`
  return `${h}${hourUnit} ${m}${minuteUnit}`
}
