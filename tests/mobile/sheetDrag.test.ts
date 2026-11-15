import { test } from 'node:test'
import assert from 'node:assert/strict'

import { sheetDragOffset, shouldCloseSheet } from '../../apps/mobile/src/components/ui/sheetDrag.ts'

test('sheet yalnız aşağı doğru parmağı izler', () => {
  assert.equal(sheetDragOffset(60), 60)
  assert.equal(sheetDragOffset(0), 0)
  assert.equal(sheetDragOffset(-40), 0)
})

test('yeterince çekilince sheet kapanır', () => {
  assert.equal(shouldCloseSheet(120, 0), true)
})

test('hızlı aşağı fiske kısa mesafede de kapatır', () => {
  assert.equal(shouldCloseSheet(30, 1200), true)
})

test('kısa çekme veya yukarı fiske sheet açık kalır', () => {
  assert.equal(shouldCloseSheet(40, 100), false)
  assert.equal(shouldCloseSheet(40, -1500), false)
  assert.equal(shouldCloseSheet(-200, 2000), false)
})
