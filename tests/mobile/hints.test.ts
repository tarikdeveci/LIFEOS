import { test } from 'node:test'
import * as assert from 'node:assert/strict'
import { shouldShowHint, updateHintState } from '../../apps/mobile/src/ai/hints'

test('shouldShowHint', async (t) => {
  const now = new Date('2026-11-16T12:00:00Z').getTime()
  const nowISO = new Date(now).toISOString()

  await t.test('shows when no state', () => {
    assert.equal(shouldShowHint(undefined, now), true)
  })

  await t.test('hides if shown today', () => {
    assert.equal(shouldShowHint({ lastShownAt: new Date(now - 1000).toISOString() }, now), false)
  })

  await t.test('shows if shown yesterday', () => {
    assert.equal(shouldShowHint({ lastShownAt: new Date(now - 24 * 60 * 60 * 1000).toISOString() }, now), true)
  })

  await t.test('hides if closed within 30 days', () => {
    assert.equal(shouldShowHint({ closedAt: new Date(now - 29 * 24 * 60 * 60 * 1000).toISOString() }, now), false)
  })

  await t.test('shows if closed > 30 days ago', () => {
    assert.equal(shouldShowHint({ closedAt: new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString() }, now), true)
  })

  await t.test('hides if used within 30 days', () => {
    assert.equal(shouldShowHint({ usedAt: new Date(now - 29 * 24 * 60 * 60 * 1000).toISOString() }, now), false)
  })

  await t.test('shows if used > 30 days ago', () => {
    assert.equal(shouldShowHint({ usedAt: new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString() }, now), true)
  })
})

test('updateHintState', async (t) => {
  const now = '2026-11-16T12:00:00.000Z'

  await t.test('updates show', () => {
    const state = updateHintState({}, 'nutrition', 'show', now)
    assert.equal(state.nutrition?.lastShownAt, now)
  })

  await t.test('updates close without overriding other', () => {
    let state = updateHintState({}, 'tasks', 'show', 'old')
    state = updateHintState(state, 'tasks', 'close', now)
    assert.equal(state.tasks?.lastShownAt, 'old')
    assert.equal(state.tasks?.closedAt, now)
  })
})