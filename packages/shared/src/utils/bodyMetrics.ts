/** Profil ve elle tartı girişinin kabul aralığı. Cihaz senkronu weight_logs CHECK aralığına tabidir. */
export const BODY_LIMITS = {
  age: { min: 13, max: 100 },
  weightKg: { min: 30, max: 300 },
  heightCm: { min: 100, max: 250 },
} as const

export type BodyMetricField = 'height' | 'weight' | 'age'

export interface BodyMetrics {
  height_cm: number | null
  body_weight_kg: number | null
  age: number | null
}

/** "72,5" ve "72.5" kabul eder; boş ya da sayı olmayan metin için null döner. */
export function parseDecimal(text: string): number | null {
  const trimmed = text.trim()
  if (!/^\d+([.,]\d+)?$/.test(trimmed)) return null
  return Number(trimmed.replace(',', '.'))
}

function inRange(value: number | null, limits: { min: number; max: number }): value is number {
  return value !== null && value >= limits.min && value <= limits.max
}

/** Boş alan geçerlidir ve null kalır; dolu alan aralık dışındaysa invalid listesine girer. */
export function parseBodyMetrics(input: Record<BodyMetricField, string>): { values: BodyMetrics; invalid: BodyMetricField[] } {
  const values: BodyMetrics = { height_cm: null, body_weight_kg: null, age: null }
  const invalid: BodyMetricField[] = []

  if (input.height.trim()) {
    const height = parseDecimal(input.height)
    if (inRange(height, BODY_LIMITS.heightCm)) values.height_cm = height
    else invalid.push('height')
  }
  if (input.weight.trim()) {
    const weight = parseDecimal(input.weight)
    if (inRange(weight, BODY_LIMITS.weightKg)) values.body_weight_kg = Math.round(weight * 10) / 10
    else invalid.push('weight')
  }
  if (input.age.trim()) {
    const age = parseDecimal(input.age)
    if (inRange(age, BODY_LIMITS.age) && Number.isInteger(age)) values.age = age
    else invalid.push('age')
  }

  return { values, invalid }
}
