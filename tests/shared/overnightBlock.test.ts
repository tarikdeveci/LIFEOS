import assert from 'node:assert/strict'
import { test } from 'node:test'

import { crossesMidnight, minutesBetween } from '../../packages/shared/src/utils/date.ts'
import { blockTiming, blockTimingForDate } from '../../packages/shared/src/utils/schedule.ts'
import { freeIntervals } from '../../packages/shared/src/utils/dayPlan.ts'
import { buildCalendar } from '../../apps/web/lib/calendar/ics.ts'

// Gece yarısını geçen blok: bitiş başlangıçtan küçük, blok BAŞLADIĞI güne ait.

test('süre bitiş başlangıçtan küçükse ertesi güne sarılır', () => {
  assert.equal(minutesBetween('23:00', '07:00'), 480)
  assert.equal(minutesBetween('23:30', '00:00'), 30)
  assert.equal(minutesBetween('09:00', '10:30'), 90)
  assert.equal(crossesMidnight('23:00', '07:00'), true)
  assert.equal(crossesMidnight('23:30', '00:00'), true)
  assert.equal(crossesMidnight('09:00', '10:30'), false)
})

test('uyku bloğu: gece 23:30 aktif, kalan süre ertesi sabaha göre', () => {
  const sleep = { start_time: '23:00:00', end_time: '07:00:00' }
  const t = blockTiming(sleep, 23 * 60 + 30)
  assert.equal(t.phase, 'active')
  assert.equal(t.durationMinutes, 480)
  assert.equal(t.remainingMinutes, 450)
  assert.equal(t.endMinute, 1440, 'günlük yerleşim gün sonuna sabit kalır')
  assert.equal(blockTiming(sleep, 22 * 60).phase, 'upcoming')
})

test('dünden başlayan gece bloğu sabah hâlâ sürer, öğlen biter', () => {
  const sleep = { start_time: '23:00:00', end_time: '07:00:00', date: '2026-11-14' }
  const morning = new Date(2026, 10, 15, 6, 0)
  assert.equal(blockTimingForDate(sleep, morning).phase, 'active')
  assert.equal(blockTimingForDate(sleep, morning).remainingMinutes, 60)
  assert.equal(blockTimingForDate(sleep, new Date(2026, 10, 15, 8, 0)).phase, 'past')
  assert.equal(blockTimingForDate({ ...sleep, date: '2026-11-10' }, morning).phase, 'past')
  assert.equal(blockTimingForDate({ ...sleep, date: '2026-11-16' }, morning).phase, 'upcoming')
})

test('gün planında gece bloğu başladığı günün sonunu kapatır', () => {
  const free = freeIntervals([{ start_time: '23:00:00', end_time: '07:00:00' }], { dayStart: '08:00', dayEnd: '23:59' })
  assert.deepEqual(free, [{ start: 480, end: 1380 }])
})

test('takvim akışında gece bloğu ertesi gün biter', () => {
  const ics = buildCalendar({
    blocks: [{ id: 'b1', date: '2026-11-15', start: '23:00:00', end: '07:00:00', title: 'Uyku', category: 'routine', completed: false, updatedAt: null }],
    name: 'LifeOS', timeZone: 'UTC', url: 'https://lifeos.tr', now: new Date('2026-11-15T12:00:00Z'),
  })
  assert.match(ics, /DTSTART:20261115T230000Z/)
  assert.match(ics, /DTEND:20261116T070000Z/)
})
