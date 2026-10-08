import { test } from 'node:test'
import assert from 'node:assert/strict'

import { calculateWsjf, wsjfToPriorityLabel } from '../../packages/shared/src/utils/priority.ts'
import { daysBetween, shiftIsoDate } from '../../packages/shared/src/utils/date.ts'
import { clockToMinutes, getDayPosition, minutesToClock } from '../../packages/shared/src/utils/schedule.ts'
import type { TimeBlock } from '../../packages/shared/src/types/planning.ts'

test('WSJF: varsayılan puanlar 1.5 verir', () => {
  const score = calculateWsjf({ value_score: 3, urgency_score: 3, risk_score: 3, effort_score: 3, friction_score: 3 })
  assert.equal(score, 1.5)
  assert.equal(wsjfToPriorityLabel(score), 'high')
})

test('WSJF: payda sıfırsa 0', () => {
  assert.equal(calculateWsjf({ value_score: 5, urgency_score: 5, risk_score: 5, effort_score: 0, friction_score: 0 }), 0)
})

test('tarih kaydırma ay ve yıl sınırını geçer', () => {
  assert.equal(shiftIsoDate('2026-12-31', 1), '2027-01-01')
  assert.equal(shiftIsoDate('2026-03-01', -1), '2026-02-28')
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2)
})

test('saat dönüşümü uçları kırpar', () => {
  assert.equal(clockToMinutes('09:30:00'), 570)
  assert.equal(minutesToClock(570), '09:30')
  assert.equal(minutesToClock(2000), '23:59')
})

const dayBlock = (id: string, start: string, end: string, completedAt: string | null = null) =>
  ({ id, start_time: start, end_time: end, date: '2026-10-01', label: id, block_type: 'task', completed_at: completedAt }) as unknown as TimeBlock

test('tamamlanan blok şu an ya da sıradaki sayılmaz', () => {
  const now = new Date(2026, 9, 1, 10, 30)
  const done = '2026-10-01T10:05:00Z'
  const position = getDayPosition(
    [dayBlock('a', '10:00', '11:00', done), dayBlock('b', '12:00', '13:00', done), dayBlock('c', '14:00', '15:00')],
    now,
  )
  assert.equal(position.activeBlock, null)
  assert.equal(position.nextBlock?.id, 'c')
  assert.equal(position.pastCount, 2)

  const allDone = getDayPosition([dayBlock('a', '10:00', '11:00', done), dayBlock('b', '12:00', '13:00', done)], now)
  assert.equal(allDone.afterLastBlock, true)
})
