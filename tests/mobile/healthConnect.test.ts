import { test } from 'node:test'
import assert from 'node:assert/strict'

import { averageBpm } from '../../apps/mobile/src/utils/health/healthConnect.ts'

test('ölçüm olmayan aralıkta kütüphanenin döndürdüğü 0 nabız "ölçüm yok" sayılır', () => {
  // react-native-health-connect 3.5.3, kayıt yokken tam olarak bunu döndürüyor.
  const empty = { BPM_AVG: 0, BPM_MAX: 0, BPM_MIN: 0, MEASUREMENTS_COUNT: 0, dataOrigins: [] }
  assert.equal(averageBpm(empty), null)
  assert.equal(averageBpm({}), null)
})

test('gerçek nabız ortalaması olduğu gibi geçer', () => {
  assert.equal(averageBpm({ BPM_AVG: 61.5, dataOrigins: ['com.example.watch'] }), 61.5)
})
