import { test } from 'node:test'
import assert from 'node:assert/strict'

import { toDayRows, toOverrides } from '../../apps/mobile/src/planning/dayRows.ts'

test('toOverrides: saat ve süre satırları, seçilmeyen gün atılır', () => {
  const rows = {
    3: { mode: 'time' as const, start: '20:00', end: '21:00', minutes: '' },
    6: { mode: 'minutes' as const, start: '', end: '', minutes: '60' },
    2: { mode: 'minutes' as const, start: '', end: '', minutes: '30' },
  }
  assert.deepEqual(toOverrides(rows, [6, 3, 1]), [
    { day_of_week: 3, start_time: '20:00', end_time: '21:00', minutes: null },
    { day_of_week: 6, start_time: null, end_time: null, minutes: 60 },
  ])
})

test('toOverrides: gece yarısını geçen saat geçerli, eşit saat ve aralık dışı süre hata', () => {
  assert.equal(toOverrides({ 1: { mode: 'time', start: '23:30', end: '00:45', minutes: '' } }, [1]).length, 1)
  assert.equal(toOverrides({ 1: { mode: 'time', start: '10:00', end: '10:00', minutes: '' } }, [1]), 'plan_err_end_after_start')
  assert.equal(toOverrides({ 1: { mode: 'time', start: '', end: '10:00', minutes: '' } }, [1]), 'plan_err_time_invalid')
  assert.equal(toOverrides({ 1: { mode: 'minutes', start: '', end: '', minutes: '0' } }, [1]), 'routines_err_day_minutes')
  assert.equal(toOverrides({ 1: { mode: 'minutes', start: '', end: '', minutes: '1440' } }, [1]), 'routines_err_day_minutes')
})

test('toDayRows: kayıtlı satırlar forma döner, saniye kırpılır', () => {
  assert.deepEqual(toDayRows([
    { day_of_week: 3, start_time: '20:00:00', end_time: '21:00:00', minutes: null },
    { day_of_week: 0, start_time: null, end_time: null, minutes: 60 },
  ]), {
    3: { mode: 'time', start: '20:00', end: '21:00', minutes: '' },
    0: { mode: 'minutes', start: '', end: '', minutes: '60' },
  })
})
