import { test } from 'node:test'
import assert from 'node:assert/strict'

import { dayContext } from '../../supabase/functions/daily-digest/copy.ts'
import { isSecondDay, localDayStartIso, secondDayCopy, type FirstDayFacts } from '../../supabase/functions/daily-digest/secondDay.ts'

const UID = '3f2b8c1e-0a4d-4c52-9f6e-1d2a3b4c5d6e'
const TODAY = '2026-11-26'
const ctx = dayContext(UID, TODAY)
const facts = (over: Partial<FirstDayFacts> = {}): FirstDayFacts => ({
  tasks: 0, meals: 0, workouts: 0, openTask: null, blocksToday: 0, ...over,
})

test('ikinci gün: dün açılan hesapta bugün ikinci gündür', () => {
  assert.equal(isSecondDay('2026-11-25T10:00:00Z', 'Europe/Istanbul', TODAY), true)
})

test('ikinci gün: hesap günü yerel saat dilimine göre hesaplanır, UTC değil', () => {
  // UTC 24 Kasım 22:30, İstanbul'da 25 Kasım 01:30: yerel gün 25, bugün ikinci gün.
  assert.equal(isSecondDay('2026-11-24T22:30:00Z', 'Europe/Istanbul', TODAY), true)
  // Aynı an UTC'de 24 Kasım: ikinci gün değil.
  assert.equal(isSecondDay('2026-11-24T22:30:00Z', 'UTC', TODAY), false)
})

test('ikinci gün: bugün açılan, iki gün önce açılan veya tarihi olmayan hesap ikinci gün değildir', () => {
  assert.equal(isSecondDay('2026-11-26T06:00:00Z', 'Europe/Istanbul', TODAY), false)
  assert.equal(isSecondDay('2026-11-24T10:00:00Z', 'Europe/Istanbul', TODAY), false)
  assert.equal(isSecondDay(null, 'Europe/Istanbul', TODAY), false)
  assert.equal(isSecondDay('gecersiz', 'Europe/Istanbul', TODAY), false)
})

test('ikinci gün metni: dünkü kayıtları sayar ve açık görevi gösterir', () => {
  const copy = secondDayCopy(facts({ tasks: 3, meals: 2, workouts: 1, openTask: 'Rapor yaz' }), ctx)
  assert.match(copy.body, /^Dün 3 görev, 2 öğün ve 1 antrenman kaydettin\./)
  assert.match(copy.body, /“Rapor yaz”/)
})

test('ikinci gün metni: açık görev yoksa öğün kaydedene öğün adımı önerilir', () => {
  const copy = secondDayCopy(facts({ meals: 1 }), ctx)
  assert.equal(copy.body, 'Dün 1 öğün kaydettin. Bugünün ilk öğününü eklemek bir dakika sürer.')
})

test('ikinci gün metni: dün hiçbir şey girmeyene suçlamadan ilk adım önerilir', () => {
  const copy = secondDayCopy(facts(), ctx)
  assert.doesNotMatch(copy.body, /Dün/)
  assert.ok(copy.title.length > 0 && copy.body.length > 0)
})

test('ikinci gün metni: uzun görev adı kırpılır', () => {
  const copy = secondDayCopy(facts({ tasks: 1, openTask: 'x'.repeat(120) }), ctx)
  assert.ok(copy.body.length < 120)
  assert.match(copy.body, /…/)
})

test('ikinci gün: bugünün yerel gece yarısı, yerel saatten geri sayılarak bulunur', () => {
  // İstanbul 08:05 = UTC 05:05; yerel gece yarısı UTC 25 Kasım 21:00.
  assert.equal(localDayStartIso('08:05', new Date('2026-11-26T05:05:42.500Z')), '2026-11-25T21:00:00.000Z')
})
