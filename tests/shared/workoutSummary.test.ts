import assert from 'node:assert/strict'
import { test } from 'node:test'

import { elapsedMinutes, recordSetId, resolveDuration, summarizeWorkout } from '../../packages/shared/src/utils/workoutSummary.ts'
import type { ExerciseSession } from '../../packages/shared/src/utils/progression.ts'

const T0 = Date.parse('2026-11-17T10:00:00Z')

test('elapsedMinutes: geçen dakika, 1 ile 300 arasına kırpılır', () => {
  assert.equal(elapsedMinutes('2026-11-17T09:15:00Z', T0), 45)
  assert.equal(elapsedMinutes('2026-11-17T10:00:00Z', T0), 1)
  assert.equal(elapsedMinutes('2026-11-16T10:00:00Z', T0), 300)
  assert.equal(elapsedMinutes('2026-11-17T11:00:00Z', T0), 1)
  assert.equal(elapsedMinutes('bozuk', T0), 1)
})

test('resolveDuration: boş alan geçen süreyi yazar, 45 değil', () => {
  assert.equal(resolveDuration('', 72), 72)
  assert.equal(resolveDuration('  ', 72), 72)
  assert.equal(resolveDuration('abc', 72), 72)
  assert.equal(resolveDuration('50', 72), 50)
  assert.equal(resolveDuration('0', 72), 1)
  assert.equal(resolveDuration('900', 72), 300)
  assert.equal(resolveDuration('', 999), 300)
})

const set = (exercise_id: string, reps: number | null, weight_kg: number | null) => ({ exercise_id, reps, weight_kg })
const past = (...sets: Array<[number, number]>): ExerciseSession => ({
  performedAt: '2026-11-10', sets: sets.map(([weight_kg, reps]) => ({ weight_kg, reps, completed: true })),
})

test('summarizeWorkout: set sayısı ve hacim, kilosuz set hacme girmez', () => {
  const s = summarizeWorkout([set('a', 10, 50), set('a', 8, 60), set('b', 20, null), set('b', 12, 0)], {})
  assert.equal(s.setCount, 4)
  assert.equal(s.volumeKg, 980)
  assert.deepEqual(s.records, [])
})

test('summarizeWorkout: önceki en iyiyi aşan hareket rekor olur', () => {
  const s = summarizeWorkout([set('a', 5, 100), set('b', 5, 40)], { a: [past([90, 5])], b: [past([50, 5])] })
  assert.equal(s.records.length, 1)
  assert.equal(s.records[0]?.exerciseId, 'a')
  assert.equal(s.records[0]?.value, 116.7)
  assert.equal(s.records[0]?.previous, 105)
})

test('summarizeWorkout: geçmişi olmayan hareket rekor sayılmaz, eşitlik rekor değil', () => {
  const s = summarizeWorkout([set('a', 5, 100), set('b', 5, 40)], { b: [past([40, 5])] })
  assert.deepEqual(s.records, [])
})

test('summarizeWorkout: set yoksa sıfır özet', () => {
  assert.deepEqual(summarizeWorkout([], {}), { setCount: 0, volumeKg: 0, records: [] })
})

test('recordSetId: geçmişi aşan en iyi yapılmış set rekordur', () => {
  const sets = [
    { id: 'a', reps: 5, weight_kg: 100, completed: true }, // 116.7
    { id: 'b', reps: 5, weight_kg: 105, completed: true }, // 122.5
    { id: 'c', reps: 5, weight_kg: 120, completed: false },
  ]
  assert.equal(recordSetId(sets, 110), 'b')
  assert.equal(recordSetId(sets, 125), null)
})

test('recordSetId: geçmiş yoksa ya da kilo girilmemişse rekor yok', () => {
  assert.equal(recordSetId([{ id: 'a', reps: 5, weight_kg: 100, completed: true }], null), null)
  assert.equal(recordSetId([{ id: 'a', reps: 5, weight_kg: null, completed: true }], 10), null)
})

test('recordSetId: eşit 1RM de önce yapılan set tutar', () => {
  const sets = [
    { id: 'a', reps: 5, weight_kg: 100, completed: true },
    { id: 'b', reps: 5, weight_kg: 100, completed: true },
  ]
  assert.equal(recordSetId(sets, 50), 'a')
})
