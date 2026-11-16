// Saat dilimi süreç başında sabitlenir: UTC'nin gerisindeki bir dilimde 'YYYY-MM-DD'
// metnini new Date() ile okumak bir önceki güne düşer, yardımcılar bunu yapmamalı.
process.env.TZ = 'America/New_York'

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { fromDateString, shiftIsoDate, toDateString, weekStartOf } from '../../packages/shared/src/utils/date.ts'

test('weekStartOf: pazartesi kendisini, pazar önceki pazartesiyi verir', () => {
  assert.equal(weekStartOf('2026-11-16'), '2026-11-16')
  assert.equal(weekStartOf('2026-11-22'), '2026-11-16')
  assert.equal(weekStartOf('2026-01-01'), '2025-12-29')
})

test('fromDateString: UTC gerisindeki dilimde aynı takvim gününü verir', () => {
  const d = fromDateString('2026-12-01')
  assert.equal(d.getDate(), 1)
  assert.equal(d.getMonth(), 11)
  assert.equal(toDateString(d), '2026-12-01')
})

test('shiftIsoDate: yaz saati geçişinde gün atlamaz', () => {
  assert.equal(shiftIsoDate('2026-03-07', 1), '2026-03-08')
  assert.equal(shiftIsoDate('2026-03-08', 1), '2026-03-09')
  assert.equal(shiftIsoDate('2026-11-01', 1), '2026-11-02')
})
