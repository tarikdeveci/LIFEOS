import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  autoPlace, dayCapacity, dropBlockMirrors, freeIntervals, mergeIntervals, shiftRemaining, subtractIntervals, taskMinutes,
} from '../../packages/shared/src/utils/dayPlan.ts'

test('subtractIntervals: kesişen kısım çıkar, kalan parçalar sıralı döner', () => {
  const busy = [{ start: 600, end: 720 }]
  assert.deepEqual(subtractIntervals(busy, [{ start: 630, end: 660 }]), [{ start: 600, end: 630 }, { start: 660, end: 720 }])
  assert.deepEqual(subtractIntervals(busy, [{ start: 590, end: 620 }, { start: 610, end: 730 }]), [])
  assert.deepEqual(subtractIntervals(busy, []), busy)
  assert.deepEqual(subtractIntervals([], busy), [])
})

test('dropBlockMirrors: bloğun takvimdeki ikizi elenir, aynı adlı başka saatteki etkinlik kalır', () => {
  const blocks = [
    { label: 'Güç · Gün 1', start_time: '18:00', end_time: '19:10:00' },
    { label: null, start_time: '09:00', end_time: '10:00' },
    { label: 'Gece koşusu', start_time: '23:30', end_time: '00:15' },
  ]
  const event = (title: string, start: number, end: number) => ({ title, start, end })
  const kept = dropBlockMirrors([
    event('Güç · Gün 1', 1080, 1150),
    // Blok 15 dakika kaydırılmış olsa da kesişiyor: hâlâ ikiz.
    event(' Güç · Gün 1 ', 1065, 1135),
    event('Güç · Gün 1', 600, 670),
    event('Diş hekimi', 1080, 1150),
    event('Toplantı', 540, 600),
    event('Gece koşusu', 1410, 15),
  ], blocks)
  assert.deepEqual(kept.map((e) => [e.title, e.start]), [['Güç · Gün 1', 600], ['Diş hekimi', 1080], ['Toplantı', 540]])
  assert.deepEqual(dropBlockMirrors([event('Güç · Gün 1', 1080, 1150)], []).length, 1)
})

const block = (id: string, start: string, end: string, done = false) =>
  ({ id, start_time: start, end_time: end, completed_at: done ? '2026-09-29T08:00:00Z' : null })
const task = (id: string, priority: number, minutes: number | null = null) =>
  ({ id, priority_score: priority, estimated_minutes: minutes })

test('süresiz görev 30 dakika sayılır', () => {
  assert.equal(taskMinutes({ estimated_minutes: null }), 30)
  assert.equal(taskMinutes({ estimated_minutes: 0 }), 30)
  assert.equal(taskMinutes({ estimated_minutes: 45 }), 45)
})

test('çakışan aralıklar birleşir', () => {
  assert.deepEqual(mergeIntervals([{ start: 60, end: 120 }, { start: 100, end: 180 }, { start: 200, end: 210 }]),
    [{ start: 60, end: 180 }, { start: 200, end: 210 }])
})

test('boşluklar: bloklar, meşgul aralıklar ve şu an düşülür', () => {
  const blocks = [block('a', '09:00', '10:00'), block('b', '09:30:00', '11:00:00')]
  const free = freeIntervals(blocks, { dayStart: '08:00', dayEnd: '12:00', busy: [{ start: 11 * 60 + 30, end: 12 * 60 }] })
  assert.deepEqual(free, [{ start: 480, end: 540 }, { start: 660, end: 690 }])
  assert.deepEqual(freeIntervals(blocks, { dayStart: '08:00', dayEnd: '12:00', from: 8 * 60 + 45 }),
    [{ start: 525, end: 540 }, { start: 660, end: 720 }])
})

test('kapasite: süresiz görev 30 dk, fazla yükte işaretlenir', () => {
  const cap = dayCapacity([{ estimated_minutes: 90 }, { estimated_minutes: null }], [block('a', '08:00', '09:00')],
    { dayStart: '08:00', dayEnd: '10:00' })
  assert.equal(cap.availableMinutes, 60)
  assert.equal(cap.plannedMinutes, 120)
  assert.equal(cap.ratio, 2)
  assert.equal(cap.overloaded, true)
})

test('otomatik yerleştir: öncelik sırası, sığmayan dışarıda kalır', () => {
  const { placements, unplaced } = autoPlace(
    [task('dusuk', 1, 30), task('yuksek', 3, 60), task('buyuk', 2, 120)],
    [block('toplanti', '09:00', '10:00')],
    { dayStart: '08:00', dayEnd: '11:00', gap: 0 },
  )
  assert.deepEqual(placements, [
    { task_id: 'yuksek', start_time: '08:00', end_time: '09:00' },
    { task_id: 'dusuk', start_time: '10:00', end_time: '10:30' },
  ])
  assert.deepEqual(unplaced.map((t) => t.id), ['buyuk'])
})

test('otomatik yerleştir: nefes payı bırakır ve geçmiş saate koymaz', () => {
  const { placements } = autoPlace([task('a', 2, 30), task('b', 1, 30)], [],
    { dayStart: '08:00', dayEnd: '12:00', from: 9 * 60 + 10, gap: 10 })
  assert.deepEqual(placements.map((p) => p.start_time), ['09:10', '09:50'])
})

test('kalanı kaydır: boşluk gecikmeyi emer, biten ve geçmiş bloklara dokunmaz', () => {
  const blocks = [
    block('gecmis', '08:00', '09:00'),
    block('aktif', '09:30', '10:30'),
    block('bitmis', '10:30', '11:00', true),
    block('bitisik', '10:30', '11:00'),
    block('uzak', '12:00', '13:00'),
  ]
  const r = shiftRemaining(blocks, 20, 9 * 60 + 40)
  assert.deepEqual(r.updates, [
    { id: 'aktif', start_time: '09:50', end_time: '10:50' },
    { id: 'bitisik', start_time: '10:50', end_time: '11:20' },
  ])
  assert.deepEqual(r.overflow, [])
  assert.equal(r.pastDayEnd, false)
})

test('kalanı kaydır: gece yarısını aşan blok taşınmaz, gün sonu aşımı bildirilir', () => {
  const r = shiftRemaining([block('a', '21:30', '22:30'), block('b', '22:30', '23:50')], 30, 21 * 60)
  assert.deepEqual(r.updates, [{ id: 'a', start_time: '22:00', end_time: '23:00' }])
  assert.deepEqual(r.overflow, ['b'])
  assert.equal(r.pastDayEnd, true)
})

test('meşgul aralıklar yerel güne kırpılır ve birleşir', async () => {
  const { busyToIntervals } = await import('../../packages/shared/src/utils/dayPlan.ts')
  const iso = (d: number, h: number, min = 0) => new Date(2026, 9, d, h, min).toISOString()
  const r = busyToIntervals([
    { starts_at: iso(4, 22), ends_at: iso(5, 1) },
    { starts_at: iso(5, 9), ends_at: iso(5, 10) },
    { starts_at: iso(5, 9, 30), ends_at: iso(5, 11) },
    { starts_at: iso(6, 9), ends_at: iso(6, 10) },
  ], '2026-10-05')
  assert.deepEqual(r, [{ start: 0, end: 60 }, { start: 540, end: 660 }])
})

test('yaz saati geçişi olan günde meşgul aralık duvar saatiyle hesaplanır', async () => {
  const { busyToIntervals } = await import('../../packages/shared/src/utils/dayPlan.ts')
  const previous = process.env['TZ']
  process.env['TZ'] = 'Europe/Berlin'
  try {
    // 25 Ekim 2026 03:00'te saat bir geri alınır: gece yarısından 09:00'a 10 gerçek saat geçer.
    const r = busyToIntervals([
      { starts_at: '2026-10-25T08:00:00Z', ends_at: '2026-10-25T09:00:00Z' },
      { starts_at: '2026-10-25T21:30:00Z', ends_at: '2026-10-26T01:00:00Z' },
    ], '2026-10-25')
    assert.deepEqual(r, [{ start: 540, end: 600 }, { start: 1350, end: 1440 }])
  } finally {
    if (previous === undefined) delete process.env['TZ']
    else process.env['TZ'] = previous
  }
})
