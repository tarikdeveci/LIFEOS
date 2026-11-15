import { test } from 'node:test'
import assert from 'node:assert/strict'

import { portionRungLabel } from '../../apps/mobile/src/utils/portionRung.ts'
import { uxEn, uxTr } from '../../apps/mobile/src/i18nUx.ts'

const RUNGS = ['stated_mass', 'stated_volume', 'user_memory', 'household_measure', 'serving_default', 'model_estimate', 'unknown'] as const

test('her porsiyon kaynağı çevrilmiş etiket verir, ham enum ekrana çıkmaz (#37)', () => {
  for (const t of [uxEn, uxTr]) {
    for (const rung of RUNGS) {
      const label = portionRungLabel(t, rung)
      assert.ok(label.length > 0)
      assert.ok(!label.includes('_'), `${rung} -> ${label}`)
    }
  }
})

test('kaynak yoksa bilinmiyor etiketi', () => {
  assert.equal(portionRungLabel(uxTr, undefined), 'bilinmiyor')
  assert.equal(portionRungLabel(uxEn, undefined), 'unknown')
})

test('user_memory porsiyon hafızası etiketi', () => {
  assert.equal(portionRungLabel(uxTr, 'user_memory'), 'senin porsiyonun')
})
