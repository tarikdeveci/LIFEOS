/**
 * Android Health Connect okuyucu — sadece Android.
 *
 * Modül dinamik import ediliyor: iOS'ta native taraf yok. Health Connect
 * Android 14'te sistemle gelir, öncesinde ayrı uygulama olarak kurulur;
 * `getSdkStatus` SDK_AVAILABLE değilse veri okunamaz.
 *
 * Toplamlar için `aggregateRecord` kullanılır — kaynak tekilleştirmesini
 * (telefon + saat aynı adımı yazabilir) Health Connect kendi yapar.
 */

import type { HealthDailyInput } from '@lifeos/shared'
import type { DayRange, HealthReadResult } from './types'

type HealthConnectModule = typeof import('react-native-health-connect')
type Permission = { accessType: 'read' | 'write'; recordType: string }

const READ_PERMISSIONS: Permission[] = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'Distance' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'RestingHeartRate' },
  { accessType: 'read', recordType: 'HeartRate' },
]

const SDK_AVAILABLE = 3

async function loadHealthConnect(): Promise<HealthConnectModule | null> {
  try {
    return await import('react-native-health-connect')
  } catch {
    return null
  }
}

async function ensureInitialized(hc: HealthConnectModule): Promise<boolean> {
  try {
    const status = await hc.getSdkStatus()
    if (status !== SDK_AVAILABLE) return false
    return await hc.initialize()
  } catch {
    return false
  }
}

export async function isAvailable(): Promise<boolean> {
  const hc = await loadHealthConnect()
  if (!hc) return false
  try {
    const status = await hc.getSdkStatus()
    return status === SDK_AVAILABLE
  } catch {
    return false
  }
}

export async function requestPermissions(): Promise<boolean> {
  const hc = await loadHealthConnect()
  if (!hc) return false
  if (!(await ensureInitialized(hc))) return false

  try {
    // Tip cast: kütüphanenin Permission tipi RecordType literal union'ı;
    // runtime string'ler doğru.
    const granted = await hc.requestPermission(READ_PERMISSIONS as never)
    return Array.isArray(granted) && granted.length > 0
  } catch {
    return false
  }
}

export async function readDay(range: DayRange): Promise<HealthReadResult> {
  const hc = await loadHealthConnect()
  if (!hc) return { ok: false, reason: 'unavailable' }
  if (!(await ensureInitialized(hc))) return { ok: false, reason: 'unavailable' }

  try {
    const between = {
      operator: 'between' as const,
      startTime: range.start.toISOString(),
      endTime: range.end.toISOString(),
    }
    const sleepWindow = {
      operator: 'between' as const,
      startTime: range.sleepWindowStart.toISOString(),
      endTime: range.end.toISOString(),
    }

    const [steps, distance, activeEnergy, exercise, restingHr, heartRate, sleep] = await Promise.all([
      aggregateNumber(hc, 'Steps', between, (r) => (r as { COUNT_TOTAL?: number }).COUNT_TOTAL ?? null),
      aggregateNumber(hc, 'Distance', between, (r) => (r as { DISTANCE?: { inMeters: number } }).DISTANCE?.inMeters ?? null),
      aggregateNumber(hc, 'ActiveCaloriesBurned', between, (r) => (r as { ACTIVE_CALORIES_TOTAL?: { inKilocalories: number } }).ACTIVE_CALORIES_TOTAL?.inKilocalories ?? null),
      aggregateNumber(hc, 'ExerciseSession', between, (r) => {
        const seconds = (r as { EXERCISE_DURATION_TOTAL?: { inSeconds: number } }).EXERCISE_DURATION_TOTAL?.inSeconds
        return seconds == null ? null : seconds / 60
      }),
      aggregateNumber(hc, 'RestingHeartRate', between, (r) => (r as { BPM_AVG?: number }).BPM_AVG ?? null),
      aggregateNumber(hc, 'HeartRate', between, (r) => (r as { BPM_AVG?: number }).BPM_AVG ?? null),
      readSleep(hc, sleepWindow),
    ])

    const exerciseCount = await countExercise(hc, between)

    const metrics: HealthDailyInput = {
      date: range.date,
      source: 'health_connect',
      steps: roundOrNull(steps),
      distance_m: roundOrNull(distance, 2),
      active_energy_kcal: roundOrNull(activeEnergy, 2),
      exercise_minutes: roundOrNull(exercise),
      workout_count: exerciseCount,
      sleep_minutes: sleep.minutes,
      sleep_start: sleep.start,
      sleep_end: sleep.end,
      resting_heart_rate: roundOrNull(restingHr, 1),
      avg_heart_rate: roundOrNull(heartRate, 1),
    }

    return { ok: true, metrics }
  } catch {
    return { ok: false, reason: 'denied' }
  }
}

type TimeRange = { operator: 'between'; startTime: string; endTime: string }

async function aggregateNumber(
  hc: HealthConnectModule,
  recordType: string,
  timeRangeFilter: TimeRange,
  extract: (result: unknown) => number | null,
): Promise<number | null> {
  try {
    const result = await hc.aggregateRecord({ recordType: recordType as never, timeRangeFilter })
    return extract(result)
  } catch {
    return null
  }
}

/**
 * Uyku süresi. SleepSession'ın SLEEP_DURATION_TOTAL'ı saniye döner; birden fazla
 * oturum varsa (kestirme + gece) toplanır. Pencere önceki akşamdan başladığı
 * için gün başlangıcını gösteren start/end de ayrıca okunur.
 */
async function readSleep(
  hc: HealthConnectModule,
  timeRangeFilter: TimeRange,
): Promise<{ minutes: number | null; start: string | null; end: string | null }> {
  try {
    const { records } = await hc.readRecords('SleepSession', { timeRangeFilter })
    if (!records || records.length === 0) return { minutes: null, start: null, end: null }

    const sessions = records
      .map((r) => {
        const rec = r as { startTime?: string; endTime?: string }
        return { start: rec.startTime ?? '', end: rec.endTime ?? '' }
      })
      .filter((s) => s.start && s.end)
      .sort((a, b) => a.start.localeCompare(b.start))

    if (sessions.length === 0) return { minutes: null, start: null, end: null }

    let totalMs = 0
    for (const s of sessions) {
      totalMs += new Date(s.end).getTime() - new Date(s.start).getTime()
    }

    return {
      minutes: Math.round(totalMs / 60000),
      start: sessions[0]!.start,
      end: sessions[sessions.length - 1]!.end,
    }
  } catch {
    return { minutes: null, start: null, end: null }
  }
}

async function countExercise(hc: HealthConnectModule, timeRangeFilter: TimeRange): Promise<number | null> {
  try {
    const { records } = await hc.readRecords('ExerciseSession', { timeRangeFilter })
    return records?.length ?? null
  } catch {
    return null
  }
}

function roundOrNull(value: number | null, decimals = 0): number | null {
  if (value === null || !Number.isFinite(value)) return null
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
