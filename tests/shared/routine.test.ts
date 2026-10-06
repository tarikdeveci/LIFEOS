import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  collapseRoutineTasks,
  habitDoneDays,
  habitWeekProgress,
  habitWeekStreak,
  isRoutineDay,
  mondayOf,
  routineOccurrenceDates,
  shouldAskStillImportant,
} from '../../packages/shared/src/utils/routine.ts'
import type { RoutineSchedule } from '../../packages/shared/src/types/routine.ts'

// 2026-09-28 Pazartesi, 2026-10-04 Pazar.
const weekly = (over: Partial<RoutineSchedule> = {}): RoutineSchedule => ({
  days_of_week: [1, 3],
  every_n_weeks: 1,
  starts_on: '2026-09-28',
  ends_on: null,
  ...over,
})

test('hafta çapası Pazartesi, Pazar önceki Pazartesiye bağlanır', () => {
  assert.equal(mondayOf('2026-09-28'), '2026-09-28')
  assert.equal(mondayOf('2026-10-04'), '2026-09-28')
  assert.equal(mondayOf('2026-10-05'), '2026-10-05')
})

test('haftalık Pzt/Çar iki haftada dört gün', () => {
  assert.deepEqual(routineOccurrenceDates(weekly(), '2026-09-28', '2026-10-11'), [
    '2026-09-28',
    '2026-09-30',
    '2026-10-05',
    '2026-10-07',
  ])
})

test('başlangıçtan önce ve bitişten sonra gün üretilmez', () => {
  const s = weekly({ starts_on: '2026-09-30', ends_on: '2026-10-05' })
  assert.deepEqual(routineOccurrenceDates(s, '2026-09-21', '2026-10-31'), ['2026-09-30', '2026-10-05'])
})

test('iki haftada bir: hafta sayımı başlangıç haftasından, gün ortası başlangıç kaymaz', () => {
  // Çarşamba başlıyor, Pazar seçili: aynı haftanın Pazarı ilk örnek, sonra 14 günde bir.
  const s = weekly({ days_of_week: [0], every_n_weeks: 2, starts_on: '2026-09-30' })
  assert.deepEqual(routineOccurrenceDates(s, '2026-09-28', '2026-11-01'), [
    '2026-10-04',
    '2026-10-18',
    '2026-11-01',
  ])
})

test('istisna günü atlanır', () => {
  assert.deepEqual(routineOccurrenceDates(weekly(), '2026-09-28', '2026-10-04', ['2026-09-30']), ['2026-09-28'])
  assert.equal(isRoutineDay(weekly(), '2026-09-29'), false)
})

test('yaz saati geçişi haftayı kaydırmaz', () => {
  // Avrupa'da 2026-10-25 saat geri alınıyor; 7 günlük adım bozulmamalı.
  const s = weekly({ days_of_week: [1], starts_on: '2026-10-19' })
  assert.deepEqual(routineOccurrenceDates(s, '2026-10-19', '2026-11-02'), ['2026-10-19', '2026-10-26', '2026-11-02'])
})

test('alışkanlık: sadece bu haftanın tekil günleri sayılır', () => {
  const p = habitWeekProgress(['2026-09-27', '2026-09-28', '2026-09-28', '2026-10-01'], 3, '2026-10-01')
  assert.deepEqual(p, { done: 2, target: 3, met: false })
})

test('günde N kez: sayaç hedefe ulaşmayan gün sayılmaz, sayaçsızda tek işaret yeter', () => {
  const days = [
    { completed_on: '2026-09-28', count: 5 },
    { completed_on: '2026-09-29', count: 2 },
    { completed_on: '2026-09-30', count: 6 },
  ]
  assert.deepEqual(habitDoneDays(days, 5), ['2026-09-28', '2026-09-30'])
  assert.deepEqual(habitDoneDays(days, null), ['2026-09-28', '2026-09-29', '2026-09-30'])
  assert.deepEqual(habitWeekProgress(habitDoneDays(days, 5), 7, '2026-09-30'), { done: 2, target: 7, met: false })
})

test('alışkanlık serisi: bitmemiş hafta seriyi bozmaz, kaçırılan hafta bozar', () => {
  const done = [
    // 2026-09-07 haftası: 1 (hedef tutmadı)
    '2026-09-08',
    // 2026-09-14 ve 2026-09-21 haftaları: 2'şer
    '2026-09-14', '2026-09-16',
    '2026-09-22', '2026-09-25',
    // içinde bulunulan hafta: 1
    '2026-09-29',
  ]
  assert.equal(habitWeekStreak(done, 2, '2026-09-30'), 2)
  assert.equal(habitWeekStreak([...done, '2026-09-30'], 2, '2026-09-30'), 3)
  assert.equal(habitWeekStreak(done, 2, '2026-10-06'), 0)
})

test('üç kez devreden sıradan görevde soru sorulur, rutin örneğinde sorulmaz', () => {
  assert.equal(shouldAskStillImportant({ carry_count: 3, routine_id: null }), true)
  assert.equal(shouldAskStillImportant({ carry_count: 2, routine_id: null }), false)
  assert.equal(shouldAskStillImportant({ carry_count: 5, routine_id: 'r1' }), false)
})

test('rutinin açık örneklerinden yalnızca en yakını kalır, tamamlananlar ve sıradan görevler durur', () => {
  const row = (id: string, routine_id: string | null, occurrence_date: string | null, status = 'planned') =>
    ({ id, routine_id, occurrence_date, status })
  const { tasks, more } = collapseRoutineTasks([
    row('a3', 'r1', '2026-10-08'),
    row('x', null, null),
    row('a1', 'r1', '2026-10-06'),
    row('a0', 'r1', '2026-10-05', 'done'),
    row('a2', 'r1', '2026-10-07'),
    row('b1', 'r2', '2026-10-06'),
  ])
  assert.deepEqual(tasks.map((t) => t.id), ['x', 'a1', 'a0', 'b1'])
  assert.equal(more.get('a1'), 2)
  assert.equal(more.has('b1'), false)
})
