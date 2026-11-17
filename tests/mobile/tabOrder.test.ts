import { test } from 'node:test'
import assert from 'node:assert/strict'

import { edgeStep } from '../../apps/mobile/src/navigation/tabOrder.ts'

test('kenarda başlayan dokunuş o kenarın yönünü verir, ekranın içi vermez', () => {
  assert.equal(edgeStep(400, 411), 1)
  assert.equal(edgeStep(10, 411), -1)
  assert.equal(edgeStep(200, 411), null)
})
