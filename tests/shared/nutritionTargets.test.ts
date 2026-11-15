import { test } from 'node:test'
import assert from 'node:assert/strict'

import { caloriesFromMacros, goalCalorieFactor, suggestMacrosFromTDEE } from '../../packages/shared/src/utils/nutrition.ts'

test('caloriesFromMacros: 4 x protein + 4 x karbonhidrat + 9 x yağ', () => {
  assert.equal(caloriesFromMacros(150, 250, 70), 2230)
  assert.equal(caloriesFromMacros(0, 0, 0), 0)
  assert.equal(caloriesFromMacros(10.5, 0, 0), 42)
})

test('suggestMacrosFromTDEE: kalori yuvarlanmış makrolarla birebir tutar', () => {
  for (const goal of ['fat_loss', 'muscle_gain', 'general'] as const) {
    for (const tdee of [1500, 2137, 2600, 3333]) {
      const m = suggestMacrosFromTDEE(tdee, goal)
      assert.equal(m.calories, caloriesFromMacros(m.protein_g, m.carbs_g, m.fat_g))
      // Yuvarlama farkı hedeften birkaç kcal'den fazla sapmaz.
      assert.ok(Math.abs(m.calories - tdee * goalCalorieFactor(goal)) <= 10)
    }
  }
})

test('goalCalorieFactor: açık, fazla ve koruma', () => {
  assert.equal(goalCalorieFactor('fat_loss'), 0.8)
  assert.equal(goalCalorieFactor('muscle_gain'), 1.1)
  assert.equal(goalCalorieFactor('general'), 1)
})
