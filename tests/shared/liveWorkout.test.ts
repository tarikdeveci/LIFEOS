import assert from 'node:assert/strict'
import { test } from 'node:test'

import { currentGroupIndex, groupSetsByExercise, suggestedWeight } from '../../packages/shared/src/utils/liveWorkout.ts'
import type { WorkoutSet } from '../../packages/shared/src/types/workout.ts'

function set(id: string, exerciseId: string, setNumber: number, extra: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id, workout_id: 'w', exercise_id: exerciseId, set_number: setNumber,
    reps: 10, weight_kg: null, duration_seconds: null, distance_m: null,
    rest_seconds: 90, notes: null, completed: false, created_at: '2026-09-30T18:00:00Z',
    ...extra,
  }
}

test('hareketler ilk görülme sırasında, setler set_number sırasında', () => {
  const groups = groupSetsByExercise([set('a2', 'bench', 2), set('b1', 'row', 1), set('a1', 'bench', 1)])
  assert.deepEqual(groups.map((g) => g.exerciseId), ['bench', 'row'])
  assert.deepEqual(groups[0]!.sets.map((s) => s.id), ['a1', 'a2'])
})

test('şimdiki hareket: tamamlanmamış seti olan ilk grup', () => {
  const groups = groupSetsByExercise([
    set('a1', 'bench', 1, { completed: true }), set('a2', 'bench', 2, { completed: true }),
    set('b1', 'row', 1), set('c1', 'squat', 1),
  ])
  assert.equal(currentGroupIndex(groups), 1)
})

test('hepsi bittiyse ve boşsa -1', () => {
  assert.equal(currentGroupIndex(groupSetsByExercise([set('a1', 'bench', 1, { completed: true })])), -1)
  assert.equal(currentGroupIndex([]), -1)
})

test('ağırlık önerisi önceki setin ağırlığını taşır, kendi değeri öncelikli', () => {
  const [group] = groupSetsByExercise([
    set('a1', 'bench', 1, { weight_kg: 60 }), set('a2', 'bench', 2), set('a3', 'bench', 3, { weight_kg: 65 }), set('a4', 'bench', 4),
  ])
  assert.equal(suggestedWeight(group!, 'a1'), 60)
  assert.equal(suggestedWeight(group!, 'a2'), 60)
  assert.equal(suggestedWeight(group!, 'a4'), 65)
  assert.equal(suggestedWeight(group!, 'yok'), null)
})

test('ilk sette ağırlık yoksa öneri yok', () => {
  const [group] = groupSetsByExercise([set('a1', 'bench', 1), set('a2', 'bench', 2, { weight_kg: 40 })])
  assert.equal(suggestedWeight(group!, 'a1'), null)
})
