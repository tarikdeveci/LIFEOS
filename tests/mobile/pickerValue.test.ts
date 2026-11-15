import { test } from 'node:test'
import assert from 'node:assert/strict'

import { dateToIso, dateToTime, isoToDate, timeToDate } from '../../apps/mobile/src/utils/pickerValue.ts'

test('timeToDate: geçerli saati bugünün o saatine çevirir', () => {
  const base = new Date(2026, 10, 15, 3, 7)
  const d = timeToDate('09:30', base)
  assert.equal(d.getHours(), 9)
  assert.equal(d.getMinutes(), 30)
  assert.equal(d.getDate(), 15)
})

test('timeToDate: boş ya da bozuk saatte varsayılan saate düşer', () => {
  const base = new Date(2026, 10, 15, 3, 7)
  for (const bad of ['', '9', '25:00', '12:60', 'ab:cd']) {
    const d = timeToDate(bad, base, '08:00')
    assert.equal(dateToTime(d), '08:00', bad)
  }
})

test('dateToTime: iki haneli saat ve dakika', () => {
  assert.equal(dateToTime(new Date(2026, 0, 1, 7, 5)), '07:05')
  assert.equal(dateToTime(new Date(2026, 0, 1, 23, 59)), '23:59')
})

test('isoToDate ve dateToIso yerel günde gidip gelir', () => {
  const d = isoToDate('2026-03-29')
  assert.ok(d)
  assert.equal(dateToIso(d), '2026-03-29')
  assert.equal(d.getHours(), 12)
})

test('isoToDate: bozuk ya da olmayan günde null', () => {
  for (const bad of ['', '2026-02-30', '2026-13-01', '26-01-01', 'yarın']) {
    assert.equal(isoToDate(bad), null, bad)
  }
})

test('timeToDate: varsayılan gün yaz saati geçişi olmayan sabit gün', () => {
  for (const v of ['00:00', '02:30', '03:15', '23:59']) {
    assert.equal(dateToTime(timeToDate(v)), v)
  }
  assert.equal(timeToDate('02:30').getMonth(), 0)
})
