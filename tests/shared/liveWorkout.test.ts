import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  MAX_PROGRAM_SETS, currentGroupIndex, groupSetsByExercise, parseSetEntry, programDaySetRows, suggestedWeight,
} from '../../packages/shared/src/utils/liveWorkout.ts'
import type { Exercise, WorkoutSet } from '../../packages/shared/src/types/workout.ts'

function set(id: string, exerciseId: string, setNumber: number, extra: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id, workout_id: 'w', exercise_id: exerciseId, set_number: setNumber,
    reps: 10, weight_kg: null, duration_seconds: null, distance_m: null,
    rest_seconds: 90, notes: null, completed: false, created_at: '2026-09-30T18:00:00Z',
    ...extra,
  }
}

// groupSetsByExercise

test('hareketler ilk görülme sırasında, setler set_number sırasında', () => {
  const groups = groupSetsByExercise([set('a2', 'bench', 2), set('b1', 'row', 1), set('a1', 'bench', 1)])
  assert.deepEqual(groups.map((g) => g.exerciseId), ['bench', 'row'])
  assert.deepEqual(groups[0]!.sets.map((s) => s.id), ['a1', 'a2'])
})

test('boş set listesi boş grup verir', () => {
  assert.deepEqual(groupSetsByExercise([]), [])
})

test('egzersiz join ile gelmediyse grup yine kurulur, exercise undefined kalır', () => {
  const [group] = groupSetsByExercise([set('a1', 'silinmis', 1)])
  assert.equal(group!.exerciseId, 'silinmis')
  assert.equal(group!.exercise, undefined)
})

test('grubun egzersiz bilgisi ilk setten gelir', () => {
  const exercise = { id: 'bench', name: 'Bench Press' } as Exercise
  const [group] = groupSetsByExercise([set('a1', 'bench', 1, { exercise }), set('a2', 'bench', 2)])
  assert.equal(group!.exercise, exercise)
})

test('aynı set_number tekrarlanırsa ikisi de kalır, sıra korunur', () => {
  const [group] = groupSetsByExercise([set('x', 'bench', 1), set('y', 'bench', 1)])
  assert.deepEqual(group!.sets.map((s) => s.id), ['x', 'y'])
})

test('girdi dizisi değişmez', () => {
  const input = [set('a2', 'bench', 2), set('a1', 'bench', 1)]
  groupSetsByExercise(input)
  assert.deepEqual(input.map((s) => s.id), ['a2', 'a1'])
})

// currentGroupIndex

test('şimdiki hareket: tamamlanmamış seti olan ilk grup', () => {
  const groups = groupSetsByExercise([
    set('a1', 'bench', 1, { completed: true }), set('a2', 'bench', 2, { completed: true }),
    set('b1', 'row', 1), set('c1', 'squat', 1),
  ])
  assert.equal(currentGroupIndex(groups), 1)
})

test('sıra dışı işaretleme: öndeki hareketin açık seti varsa o şimdiki', () => {
  const groups = groupSetsByExercise([
    set('a1', 'bench', 1), set('b1', 'row', 1, { completed: true }),
  ])
  assert.equal(currentGroupIndex(groups), 0)
})

test('hepsi bittiyse ve boşsa -1', () => {
  assert.equal(currentGroupIndex(groupSetsByExercise([set('a1', 'bench', 1, { completed: true })])), -1)
  assert.equal(currentGroupIndex([]), -1)
})

// suggestedWeight

test('ağırlık önerisi önceki setin ağırlığını taşır, kendi değeri öncelikli', () => {
  const [group] = groupSetsByExercise([
    set('a1', 'bench', 1, { weight_kg: 60 }), set('a2', 'bench', 2), set('a3', 'bench', 3, { weight_kg: 65 }), set('a4', 'bench', 4),
  ])
  assert.equal(suggestedWeight(group!, 'a1'), 60)
  assert.equal(suggestedWeight(group!, 'a2'), 60)
  assert.equal(suggestedWeight(group!, 'a4'), 65)
})

test('ağırlık önerisi: bilinmeyen set ve ilk sette ağırlık yoksa null', () => {
  const [group] = groupSetsByExercise([set('a1', 'bench', 1), set('a2', 'bench', 2, { weight_kg: 40 })])
  assert.equal(suggestedWeight(group!, 'a1'), null)
  assert.equal(suggestedWeight(group!, 'yok'), null)
})

test('0 kg geçerli bir ağırlık, boş sayılmaz', () => {
  const [group] = groupSetsByExercise([set('a1', 'pushup', 1, { weight_kg: 0 }), set('a2', 'pushup', 2)])
  assert.equal(suggestedWeight(group!, 'a2'), 0)
})

// parseSetEntry: geçerli girdiler

test('ağırlık ve tekrar okunur, virgül ondalık ayırıcı sayılır', () => {
  assert.deepEqual(parseSetEntry('60', '8'), { weight_kg: 60, reps: 8 })
  assert.deepEqual(parseSetEntry('62,5', '10'), { weight_kg: 62.5, reps: 10 })
  assert.deepEqual(parseSetEntry('62.25', '10'), { weight_kg: 62.25, reps: 10 })
})

test('boşluklar kırpılır, sınır değerler kabul', () => {
  assert.deepEqual(parseSetEntry('  60 ', ' 8 '), { weight_kg: 60, reps: 8 })
  assert.deepEqual(parseSetEntry('0', '0'), { weight_kg: 0, reps: 0 })
  assert.deepEqual(parseSetEntry('999.99', '999'), { weight_kg: 999.99, reps: 999 })
})

test('boş alan yazılmaz, setin mevcut değeri kalır', () => {
  assert.deepEqual(parseSetEntry('', '8'), { reps: 8 })
  assert.deepEqual(parseSetEntry('60', ''), { weight_kg: 60 })
  assert.deepEqual(parseSetEntry('', ''), {})
  assert.deepEqual(parseSetEntry('   ', '  '), {})
})

// parseSetEntry: geçersiz girdiler

test('geçersiz ağırlık null döner', () => {
  for (const bad of ['abc', '-5', '1000', '1e3', '60kg', '6..0', '60,5,5', '.5', '5.', '60.123', 'NaN', 'Infinity', '0x10']) {
    assert.equal(parseSetEntry(bad, '8'), null, bad)
  }
})

test('geçersiz tekrar null döner', () => {
  for (const bad of ['abc', '-1', '8.5', '8,5', '1000', '1e2', '10x']) {
    assert.equal(parseSetEntry('60', bad), null, bad)
  }
})

test('alanlardan biri geçersizse diğeri geçerli olsa da null', () => {
  assert.equal(parseSetEntry('abc', ''), null)
  assert.equal(parseSetEntry('', '-3'), null)
})

// programDaySetRows

const ex = (id: string, order: number, sets: number, reps: number | null = 10) =>
  ({ exercise_id: id, sets, reps, rest_seconds: 90, order_index: order })
const START = Date.parse('2026-10-01T18:00:00.000Z')

test('program setleri order_index sırasında, created_at her satırda artar', () => {
  const rows = programDaySetRows('w', [ex('fly', 2, 1), ex('bench', 1, 2)], START)
  assert.deepEqual(rows.map((r) => [r.exercise_id, r.set_number]), [['bench', 1], ['bench', 2], ['fly', 1]])
  assert.deepEqual(rows.map((r) => r.created_at), [
    '2026-10-01T18:00:00.000Z', '2026-10-01T18:00:00.001Z', '2026-10-01T18:00:00.002Z',
  ])
  assert.ok(rows.every((r) => r.workout_id === 'w' && r.rest_seconds === 90))
})

test('DB created_at sıralaması hareket sırasını geri verir (eşitlik kalmaz)', () => {
  const rows = programDaySetRows('w', [ex('a', 1, 3), ex('b', 2, 3), ex('c', 3, 3)], START)
  const shuffled = [...rows].reverse().map((r, i) => set(`s${i}`, r.exercise_id, r.set_number!, { created_at: r.created_at! }))
  const fromDb = [...shuffled].sort((x, y) => x.created_at.localeCompare(y.created_at))
  assert.deepEqual(groupSetsByExercise(fromDb).map((g) => g.exerciseId), ['a', 'b', 'c'])
})

test('bozuk set sayısı sınırlanır: 0 ve eksi 1 olur, fazlası 12, sayı değilse 3', () => {
  const count = (sets: number) => programDaySetRows('w', [ex('a', 1, sets)], START).length
  assert.equal(count(0), 1)
  assert.equal(count(-4), 1)
  assert.equal(count(50), MAX_PROGRAM_SETS)
  assert.equal(count(Number.NaN), 3)
  assert.equal(count(2.7), 2)
})

test('tekrar tanımsızsa 10, hareket yoksa satır yok', () => {
  assert.equal(programDaySetRows('w', [ex('a', 1, 1, null)], START)[0]!.reps, 10)
  assert.deepEqual(programDaySetRows('w', [], START), [])
})

test('girdi dizisi sıralanırken değişmez', () => {
  const input = [ex('b', 2, 1), ex('a', 1, 1)]
  programDaySetRows('w', input, START)
  assert.deepEqual(input.map((e) => e.exercise_id), ['b', 'a'])
})
