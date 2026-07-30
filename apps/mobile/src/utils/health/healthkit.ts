/**
 * Apple Health (HealthKit) okuyucu — sadece iOS.
 *
 * Modül dinamik import ediliyor: Android'de ve Expo Go'da native taraf yok,
 * statik import metro bundle'ında patlıyor.
 *
 * Adım/mesafe/kalori için `queryStatisticsForQuantity` kullanılır — HealthKit
 * aynı veriyi hem iPhone hem Watch'tan alabildiği için örnekleri elle toplamak
 * çift sayıma yol açar; istatistik sorgusu kaynak tekilleştirmesini kendi yapar.
 */

import type { HealthDailyInput } from '@lifeos/shared'
import type { DayRange, HealthReadResult } from './types'

// Okunacak veri tipleri — izin ekranında kullanıcıya gösterilen liste
const READ_IDENTIFIERS = [
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierAppleExerciseTime',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRate',
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKWorkoutTypeIdentifier',
] as const

type HealthKitModule = typeof import('@kingstinct/react-native-healthkit')

async function loadHealthKit(): Promise<HealthKitModule | null> {
  try {
    return await import('@kingstinct/react-native-healthkit')
  } catch {
    return null
  }
}

export async function isAvailable(): Promise<boolean> {
  const hk = await loadHealthKit()
  if (!hk) return false
  try {
    return hk.isHealthDataAvailable()
  } catch {
    return false
  }
}

/**
 * İzin ister. HealthKit okuma izinlerinde Apple gizlilik gereği "verdi mi"
 * bilgisini vermez — dönen `true` yalnızca ekranın gösterildiği anlamına gelir.
 * Gerçek kontrol: veri okunabiliyor mu (bkz. readDay).
 */
export async function requestPermissions(): Promise<boolean> {
  const hk = await loadHealthKit()
  if (!hk) return false
  try {
    return await hk.requestAuthorization({ toRead: READ_IDENTIFIERS })
  } catch {
    return false
  }
}

/** Uyku "asleep" sayılan kategori değerleri (inBed ve awake hariç) */
const ASLEEP_VALUES = new Set([1, 3, 4, 5]) // asleepUnspecified, asleepCore, asleepDeep, asleepREM

export async function readDay(range: DayRange): Promise<HealthReadResult> {
  const hk = await loadHealthKit()
  if (!hk) return { ok: false, reason: 'unavailable' }

  try {
    const filter = { date: { startDate: range.start, endDate: range.end } }

    const [steps, distance, activeEnergy, exerciseTime, restingHr, avgHr] = await Promise.all([
      sumStatistic(hk, 'HKQuantityTypeIdentifierStepCount', filter, 'count'),
      sumStatistic(hk, 'HKQuantityTypeIdentifierDistanceWalkingRunning', filter, 'm'),
      sumStatistic(hk, 'HKQuantityTypeIdentifierActiveEnergyBurned', filter, 'kcal'),
      sumStatistic(hk, 'HKQuantityTypeIdentifierAppleExerciseTime', filter, 'min'),
      averageStatistic(hk, 'HKQuantityTypeIdentifierRestingHeartRate', filter, 'count/min'),
      averageStatistic(hk, 'HKQuantityTypeIdentifierHeartRate', filter, 'count/min'),
    ])

    const sleep = await readSleep(hk, range)
    const workouts = await countWorkouts(hk, range)

    const metrics: HealthDailyInput = {
      date: range.date,
      source: 'apple_health',
      steps: roundOrNull(steps),
      distance_m: roundOrNull(distance, 2),
      active_energy_kcal: roundOrNull(activeEnergy, 2),
      exercise_minutes: roundOrNull(exerciseTime),
      workout_count: workouts,
      sleep_minutes: sleep.minutes,
      sleep_start: sleep.start,
      sleep_end: sleep.end,
      resting_heart_rate: roundOrNull(restingHr, 1),
      avg_heart_rate: roundOrNull(avgHr, 1),
    }

    return { ok: true, metrics }
  } catch {
    // İzin verilmediyse sorgular hata fırlatır — "veri yok" ile karıştırmamak için
    // ayrı bir sebep dönüyoruz.
    return { ok: false, reason: 'denied' }
  }
}

type QuantityIdentifier = Parameters<HealthKitModule['queryStatisticsForQuantity']>[0]
type StatisticsFilter = { date: { startDate: Date; endDate: Date } }

async function sumStatistic(
  hk: HealthKitModule,
  identifier: QuantityIdentifier,
  filter: StatisticsFilter,
  unit: string,
): Promise<number | null> {
  try {
    const result = await hk.queryStatisticsForQuantity(identifier, ['cumulativeSum'], {
      filter,
      // Unit tipleri identifier'a bağlı literal union; runtime değer doğru,
      // jenerik eşleştirmeyi TS burada çözemiyor.
      unit: unit as never,
    })
    return result.sumQuantity?.quantity ?? null
  } catch {
    return null
  }
}

async function averageStatistic(
  hk: HealthKitModule,
  identifier: QuantityIdentifier,
  filter: StatisticsFilter,
  unit: string,
): Promise<number | null> {
  try {
    const result = await hk.queryStatisticsForQuantity(identifier, ['discreteAverage'], {
      filter,
      unit: unit as never,
    })
    return result.averageQuantity?.quantity ?? null
  } catch {
    return null
  }
}

/**
 * Uyku süresi. Örnekler çakışabildiği için (Watch + telefon aynı aralığı
 * yazabilir) aralıklar birleştirilip toplam süre öyle hesaplanır.
 */
async function readSleep(
  hk: HealthKitModule,
  range: DayRange,
): Promise<{ minutes: number | null; start: string | null; end: string | null }> {
  try {
    const samples = await hk.queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
      limit: 0,
      filter: { date: { startDate: range.sleepWindowStart, endDate: range.end } },
    })

    const asleep = samples
      .filter((s) => ASLEEP_VALUES.has(Number(s.value)))
      .map((s) => ({ start: new Date(s.startDate).getTime(), end: new Date(s.endDate).getTime() }))
      .filter((s) => s.end > s.start)
      .sort((a, b) => a.start - b.start)

    if (asleep.length === 0) return { minutes: null, start: null, end: null }

    let totalMs = 0
    let windowStart = asleep[0]!.start
    let windowEnd = asleep[0]!.end

    for (const segment of asleep.slice(1)) {
      if (segment.start <= windowEnd) {
        windowEnd = Math.max(windowEnd, segment.end)
      } else {
        totalMs += windowEnd - windowStart
        windowStart = segment.start
        windowEnd = segment.end
      }
    }
    totalMs += windowEnd - windowStart

    return {
      minutes: Math.round(totalMs / 60000),
      start: new Date(asleep[0]!.start).toISOString(),
      end: new Date(asleep[asleep.length - 1]!.end).toISOString(),
    }
  } catch {
    return { minutes: null, start: null, end: null }
  }
}

async function countWorkouts(hk: HealthKitModule, range: DayRange): Promise<number | null> {
  try {
    const workouts = await hk.queryWorkoutSamples({
      limit: 0,
      filter: { date: { startDate: range.start, endDate: range.end } },
    })
    return workouts.length
  } catch {
    return null
  }
}

function roundOrNull(value: number | null, decimals = 0): number | null {
  if (value === null || !Number.isFinite(value)) return null
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
