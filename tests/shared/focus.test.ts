import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  advancePomodoro, completedFocusWork, focusMinutesByBlock, pomodoroDeadline,
  remainingFocusSeconds, startPomodoro, stopPomodoro,
} from '../../packages/shared/src/utils/focus.ts'

const start = Date.parse('2026-09-30T20:50:00+03:00')

test('25/5 defaults and exact phase boundaries', () => {
  const work = startPomodoro(start)
  assert.equal(remainingFocusSeconds(work, start), 1500)
  assert.equal(advancePomodoro(work, start + 1499999), work)
  const rest = advancePomodoro(work, start + 1500000)
  assert.equal(rest.phase, 'break')
  assert.equal(rest.phaseStartedAt, start + 1500000)
  assert.equal(remainingFocusSeconds(rest, start + 1500000), 300)
  assert.equal(advancePomodoro(rest, start + 1800000).phase, 'ready')
})

test('suspended timers catch up without inventing more work periods', () => {
  const work = startPomodoro(start)
  assert.equal(remainingFocusSeconds(work, start + 123400), 1377)
  assert.equal(advancePomodoro(work, start + 27 * 60000).phase, 'break')
  assert.equal(advancePomodoro(work, start + 8 * 3600000).phase, 'ready')
  assert.equal(completedFocusWork(work, start + 8 * 3600000)?.minutes, 25)
})

test('manual finish records elapsed work with minimum one minute', () => {
  const work = startPomodoro(start)
  assert.equal(completedFocusWork(work, start + 10000)?.minutes, 1)
  assert.equal(completedFocusWork(work, start + 181000)?.minutes, 3)
  const immediate = completedFocusWork(work, start)!
  assert.ok(Date.parse(immediate.ended_at) > Date.parse(immediate.started_at))
  const stopped = stopPomodoro(work)
  assert.equal(remainingFocusSeconds(stopped, start), 0)
  assert.equal(completedFocusWork(stopped, start), null)
  assert.equal(advancePomodoro(stopped, start + 3600000), stopped)
})

test('breaks never count and a new cycle is explicit', () => {
  const rest = advancePomodoro(startPomodoro(start), start + 1500000)
  assert.equal(completedFocusWork(rest, start + 1600000), null)
  const next = startPomodoro(start + 1800000, rest)
  assert.equal(next.phase, 'work')
  assert.equal(pomodoroDeadline(next), start + 3300000)
})

test('custom duration, clock rollback and validation', () => {
  const work = startPomodoro(start, { workMinutes: 50, breakMinutes: 10 })
  assert.equal(remainingFocusSeconds(work, start - 10000), 3000)
  assert.equal(advancePomodoro(work, start + 3000000).breakMinutes, 10)
  for (const minutes of [0, -1, 601, 1.5, NaN]) {
    assert.throws(() => startPomodoro(start, { workMinutes: minutes, breakMinutes: 5 }), RangeError)
  }
})

test('work crossing local midnight keeps absolute elapsed duration', () => {
  const midnight = Date.parse('2026-10-01T23:50:00+03:00')
  const work = startPomodoro(midnight)
  assert.equal(completedFocusWork(work, midnight + 1500000)?.minutes, 25)
})

test('block totals include repeat sessions and ignore deleted block links', () => {
  assert.deepEqual(focusMinutesByBlock([
    { block_id: 'a', minutes: 25 }, { block_id: 'b', minutes: 3 },
    { block_id: 'a', minutes: 7 }, { block_id: null, minutes: 10 },
  ]), new Map([['a', 32], ['b', 3]]))
  assert.deepEqual(focusMinutesByBlock([]), new Map())
})
