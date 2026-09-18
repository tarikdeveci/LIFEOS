/**
 * Platform bağımsız sağlık okuyucu cephesi.
 *
 * iOS → Apple HealthKit, Android → Health Connect. Her ikisi de dinamik import
 * ile yüklenir; native modül yoksa (Expo Go, web) sessizce "kullanılamıyor" döner.
 */

import { Platform } from 'react-native'
import type { DayRange, HealthReader } from './types'

export type { DayRange, HealthReadResult, HealthReadFailure } from './types'
export { buildDayRange } from './types'

/** `readWeight`, platform modüllerinde var ama HealthReader arayüzünün parçası değil. */
type WeightReader = { readWeight: (range: DayRange) => Promise<{ weightKg: number } | null> }

let cached: HealthReader | null = null
let cachedWeight: WeightReader | null = null

function getReader(): HealthReader {
  if (cached) return cached

  if (Platform.OS === 'ios') {
    cached = require('./healthkit') as HealthReader
  } else if (Platform.OS === 'android') {
    cached = require('./healthConnect') as HealthReader
  } else {
    cached = {
      isAvailable: async () => false,
      requestPermissions: async () => false,
      readDay: async () => ({ ok: false, reason: 'unavailable' }),
    }
  }

  return cached
}

function getWeightReader(): WeightReader {
  if (cachedWeight) return cachedWeight

  if (Platform.OS === 'ios') {
    cachedWeight = require('./healthkit') as WeightReader
  } else if (Platform.OS === 'android') {
    cachedWeight = require('./healthConnect') as WeightReader
  } else {
    cachedWeight = { readWeight: async () => null }
  }

  return cachedWeight
}

export function isHealthAvailable(): Promise<boolean> {
  return getReader().isAvailable()
}

export function requestHealthPermissions(): Promise<boolean> {
  return getReader().requestPermissions()
}

export function readHealthDay(date: string, now: Date = new Date()) {
  const { buildDayRange } = require('./types') as typeof import('./types')
  return getReader().readDay(buildDayRange(date, now))
}

/** O günün en güncel tartı ölçümü; ölçüm yoksa veya cihaz izin vermiyorsa null. */
export function readHealthWeight(date: string, now: Date = new Date()) {
  const { buildDayRange } = require('./types') as typeof import('./types')
  return getWeightReader().readWeight(buildDayRange(date, now))
}
