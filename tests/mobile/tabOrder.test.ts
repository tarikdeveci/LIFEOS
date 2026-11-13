import { test } from 'node:test'
import assert from 'node:assert/strict'

import { adjacentTab, edgeStep } from '../../apps/mobile/src/navigation/tabOrder.ts'

const TABS = ['today', 'planning', 'tasks', 'nutrition', 'workout']

test('sola kaydırma sıradaki sekmeye, sağa kaydırma öncekine gider', () => {
  assert.equal(adjacentTab('/nutrition', 1, TABS), 'workout')
  assert.equal(adjacentTab('/nutrition', -1, TABS), 'tasks')
})

test('ilk ve son sekmede başa sarmaz', () => {
  assert.equal(adjacentTab('/workout', 1, TABS), null)
  assert.equal(adjacentTab('/today', -1, TABS), null)
})

test('ana sekme olmayan ekranda çalışmaz', () => {
  assert.equal(adjacentTab('/profile', 1, TABS), null)
  assert.equal(adjacentTab('/settings/calendar', -1, TABS), null)
})

test('kenarda başlayan dokunuş o kenarın yönünü verir, ekranın içi vermez', () => {
  assert.equal(edgeStep(400, 411), 1)
  assert.equal(edgeStep(10, 411), -1)
  assert.equal(edgeStep(200, 411), null)
})
