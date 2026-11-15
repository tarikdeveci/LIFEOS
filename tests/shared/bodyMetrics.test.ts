import assert from 'node:assert/strict'
import test from 'node:test'

import { BODY_LIMITS, parseBodyMetrics, parseDecimal } from '../../packages/shared/src/utils/bodyMetrics.ts'
import { patchProfilePreferences } from '../../packages/shared/src/supabase/health.ts'

test('parseDecimal virgül ve noktayı kabul eder, sayı olmayanı reddeder', () => {
  assert.equal(parseDecimal('72,5'), 72.5)
  assert.equal(parseDecimal('72.5'), 72.5)
  assert.equal(parseDecimal(' 80 '), 80)
  assert.equal(parseDecimal(''), null)
  assert.equal(parseDecimal('72,5kg'), null)
  assert.equal(parseDecimal('1.2.3'), null)
  assert.equal(parseDecimal('-5'), null)
})

test('parseBodyMetrics geçerli değerleri sayıya çevirir, kiloyu tek ondalığa yuvarlar', () => {
  const result = parseBodyMetrics({ height: '175,5', weight: '72,46', age: '30' })
  assert.deepEqual(result.invalid, [])
  assert.deepEqual(result.values, { height_cm: 175.5, body_weight_kg: 72.5, age: 30 })
})

test('parseBodyMetrics boş alanı null bırakır, hata saymaz', () => {
  const result = parseBodyMetrics({ height: '', weight: ' ', age: '' })
  assert.deepEqual(result.invalid, [])
  assert.deepEqual(result.values, { height_cm: null, body_weight_kg: null, age: null })
})

test('parseBodyMetrics aralık sınırlarını dahil sayar, dışını reddeder', () => {
  const { age, weightKg, heightCm } = BODY_LIMITS
  const edge = parseBodyMetrics({ height: String(heightCm.max), weight: String(weightKg.min), age: String(age.min) })
  assert.deepEqual(edge.invalid, [])

  const out = parseBodyMetrics({ height: '99', weight: '301', age: '12' })
  assert.deepEqual(out.invalid, ['height', 'weight', 'age'])
})

test('parseBodyMetrics ondalıklı yaşı ve metni reddeder', () => {
  assert.deepEqual(parseBodyMetrics({ height: 'abc', weight: '70', age: '30,5' }).invalid, ['height', 'age'])
})

function preferencesDb(row: { preferences: unknown } | null, readError: unknown = null) {
  const writes: Array<{ id: string; preferences: Record<string, unknown> }> = []
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: readError }) }) }),
      upsert: async (payload: { id: string; preferences: Record<string, unknown> }) => {
        writes.push(payload)
        return { error: null }
      },
    }),
  }
  return { client: client as never, writes }
}

test('patchProfilePreferences planlama ve tema gibi diğer anahtarları korur', async () => {
  const { client, writes } = preferencesDb({ preferences: { theme: 'dark', planning: { max_deep_tasks: 2 }, body_weight_kg: 70 } })
  await patchProfilePreferences(client, 'u1', { body_weight_kg: 72.5 })
  assert.deepEqual(writes, [{ id: 'u1', preferences: { theme: 'dark', planning: { max_deep_tasks: 2 }, body_weight_kg: 72.5 } }])
})

test('patchProfilePreferences profil satırı yoksa yenisini yazar', async () => {
  const { client, writes } = preferencesDb(null)
  await patchProfilePreferences(client, 'u1', { age: 30 })
  assert.deepEqual(writes, [{ id: 'u1', preferences: { age: 30 } }])
})

test('patchProfilePreferences okuma hatasında hiçbir şey yazmaz', async () => {
  const { client, writes } = preferencesDb(null, new Error('okunamadı'))
  await assert.rejects(patchProfilePreferences(client, 'u1', { age: 30 }), /okunamadı/)
  assert.equal(writes.length, 0)
})
