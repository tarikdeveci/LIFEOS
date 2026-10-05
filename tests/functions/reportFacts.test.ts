import { test } from 'node:test'
import assert from 'node:assert/strict'

import { dayBoundsUtc, isIsoDate, isValidTimeZone, localDateIn } from '../../supabase/functions/_shared/report/dates.ts'
import {
  buildDayFacts,
  type FactsBlock,
  type FactsInput,
  type FactsRoutine,
  type FactsTask,
} from '../../supabase/functions/_shared/report/facts.ts'

const DATE = '2026-10-07' // Çarşamba, haftanın Pazartesi'si 2026-10-05

const task = (over: Partial<FactsTask> & { id: string }): FactsTask => ({
  title: over.id,
  status: 'planned',
  area: null,
  routine_id: null,
  estimated_minutes: null,
  ...over,
})

const block = (over: Partial<FactsBlock> & { id: string }): FactsBlock => ({
  task_id: null,
  label: over.id,
  block_type: 'task',
  start_time: '09:00:00',
  end_time: '10:00:00',
  routine_id: null,
  completed_at: null,
  ...over,
})

const routine = (over: Partial<FactsRoutine> & { id: string }): FactsRoutine => ({
  title: over.id,
  kind: 'habit',
  area: null,
  times_per_week: 3,
  times_per_day: null,
  estimated_minutes: null,
  target_count: null,
  is_untracked: false,
  is_active: true,
  starts_on: '2026-09-01',
  ends_on: null,
  ...over,
})

const input = (over: Partial<FactsInput> = {}): FactsInput => ({
  date: DATE,
  tasks: [],
  blocks: [],
  routines: [],
  completions: [],
  energy: null,
  focusMinutes: 0,
  health: null,
  workoutCompleted: false,
  meals: [],
  calorieTarget: null,
  progress: {},
  generatedAt: '2026-10-07T18:00:00.000Z',
  ...over,
})

test('göreve bağlı blok ayrı öğe olmaz: görev bloğun saatini ve süresini alır', () => {
  const facts = buildDayFacts(input({
    tasks: [task({ id: 't1', title: 'Rapor yaz', estimated_minutes: 30 })],
    blocks: [block({ id: 'b1', task_id: 't1', start_time: '14:00:00', end_time: '15:30:00' })],
  }))
  assert.deepEqual(facts.items.map((i) => i.key), ['task:t1'])
  assert.equal(facts.items[0]?.start_time, '14:00')
  assert.equal(facts.items[0]?.minutes, 90)
})

test('göreve bağlı iki blok: en erken saat, süreler toplanır', () => {
  const facts = buildDayFacts(input({
    tasks: [task({ id: 't1' })],
    blocks: [
      block({ id: 'b2', task_id: 't1', start_time: '16:00:00', end_time: '16:30:00' }),
      block({ id: 'b1', task_id: 't1', start_time: '09:00:00', end_time: '10:00:00' }),
    ],
  }))
  assert.equal(facts.items.length, 1)
  assert.equal(facts.items[0]?.start_time, '09:00')
  assert.equal(facts.items[0]?.minutes, 90)
})

test('bugünün listesinde olmayan göreve bağlı blok kendi başına öğe olur', () => {
  const facts = buildDayFacts(input({ blocks: [block({ id: 'b1', task_id: 'baska-gun', label: 'Toplantı' })] }))
  assert.deepEqual(facts.items.map((i) => [i.key, i.title]), [['block:b1', 'Toplantı']])
})

test('ertelenmiş görev ve bağlı bloğu rapora girmez', () => {
  const facts = buildDayFacts(input({
    tasks: [task({ id: 't1', status: 'deferred' }), task({ id: 't2' })],
    blocks: [block({ id: 'b1', task_id: 't1' })],
  }))
  assert.deepEqual(facts.items.map((i) => i.key), ['task:t2'])
})

test('sonuç: biten görev ve tamamlanmış blok done, gerisi open', () => {
  const facts = buildDayFacts(input({
    tasks: [task({ id: 't1', status: 'done' }), task({ id: 't2', status: 'in_progress' })],
    blocks: [
      block({ id: 'b1', completed_at: '2026-10-07T10:00:00Z', start_time: '08:00:00', end_time: '08:30:00' }),
      block({ id: 'b2', start_time: '11:00:00', end_time: '11:30:00' }),
    ],
  }))
  const outcomes = Object.fromEntries(facts.items.map((i) => [i.key, i.outcome]))
  assert.deepEqual(outcomes, { 'block:b1': 'done', 'block:b2': 'open', 'task:t1': 'done', 'task:t2': 'open' })
  assert.ok(facts.items.every((i) => i.expected && i.reason === null))
})

test('öğün blokları ve rutinsiz molalar rapora girmez', () => {
  const facts = buildDayFacts(input({
    blocks: [
      block({ id: 'b1', block_type: 'meal' }),
      block({ id: 'b2', block_type: 'break' }),
      block({ id: 'b3', block_type: 'break', routine_id: 'r1', label: 'Yürüyüş' }),
    ],
    routines: [routine({ id: 'r1', kind: 'block' })],
  }))
  assert.deepEqual(facts.items.map((i) => i.key), ['block:b3'])
})

test('alan çözümü: görevin kendi alanı, yoksa rutinin, blokta rutin ya da tipten', () => {
  const facts = buildDayFacts(input({
    tasks: [
      task({ id: 'kendi', area: 'spiritual', routine_id: 'r-health' }),
      task({ id: 'rutinden', routine_id: 'r-health' }),
      task({ id: 'alansiz' }),
    ],
    blocks: [
      block({ id: 'rutin-blok', block_type: 'routine', routine_id: 'r-social' }),
      block({ id: 'spor', block_type: 'workout' }),
      block({ id: 'mola', block_type: 'break', routine_id: 'r-nolabel' }),
      block({ id: 'duz', block_type: 'focus' }),
    ],
    routines: [
      routine({ id: 'r-health', kind: 'task', area: 'health' }),
      routine({ id: 'r-social', kind: 'block', area: 'social' }),
      routine({ id: 'r-nolabel', kind: 'block', area: null }),
    ],
  }))
  const area = (key: string) => facts.items.find((i) => i.key === key)?.area
  assert.equal(area('task:kendi'), 'spiritual')
  assert.equal(area('task:rutinden'), 'health')
  assert.equal(area('task:alansiz'), null)
  assert.equal(area('block:rutin-blok'), 'social')
  assert.equal(area('block:spor'), 'health')
  assert.equal(area('block:mola'), 'personal')
  assert.equal(area('block:duz'), null)
})

test('program ilerlemesi: sayaçlı rutin örneğinde haritadan, sayaçsızda ve haritada olmayanda null', () => {
  const facts = buildDayFacts(input({
    tasks: [
      task({ id: 'audit', routine_id: 'r-audit' }),
      task({ id: 'dua', routine_id: 'r-dua' }),
      task({ id: 'haritasiz', routine_id: 'r-eksik' }),
    ],
    routines: [
      routine({ id: 'r-audit', kind: 'task', target_count: 42 }),
      routine({ id: 'r-dua', kind: 'task', target_count: 10, is_untracked: true }),
      routine({ id: 'r-eksik', kind: 'task', target_count: 5 }),
    ],
    progress: { 'r-audit': 7, 'r-dua': 3 },
  }))
  assert.deepEqual(facts.items.find((i) => i.key === 'task:audit')?.program, { done: 7, target: 42 })
  assert.equal(facts.items.find((i) => i.key === 'task:dua')?.program, null)
  assert.equal(facts.items.find((i) => i.key === 'task:haritasiz')?.program, null)
})

test('sayaçsız alışkanlık: haftalık listeye girmez, program taşımaz, yalnız yapıldıysa görünür', () => {
  const untracked = routine({ id: 'dua', title: 'Dua', area: 'spiritual', is_untracked: true, target_count: 9 })
  const notDone = buildDayFacts(input({ routines: [untracked], progress: { dua: 4 } }))
  assert.deepEqual(notDone.items, [])
  assert.deepEqual(notDone.habits_week, [])

  const done = buildDayFacts(input({
    routines: [untracked],
    completions: [{ routine_id: 'dua', completed_on: DATE, count: 1 }],
    progress: { dua: 4 },
  }))
  assert.equal(done.items.length, 1)
  assert.equal(done.items[0]?.key, 'habit:dua')
  assert.equal(done.items[0]?.outcome, 'done')
  assert.equal(done.items[0]?.expected, false)
  assert.equal(done.items[0]?.program, null)
  assert.deepEqual(done.habits_week, [])
})

test('sayaçsız rutinin görev ve blok örnekleri de beklenmez (sayıya girmez), program taşımaz', () => {
  const facts = buildDayFacts(input({
    tasks: [task({ id: 'dua', routine_id: 'r-dini' })],
    blocks: [block({ id: 'namaz', block_type: 'routine', routine_id: 'r-dini-blok', start_time: '13:00:00', end_time: '13:45:00' })],
    routines: [
      routine({ id: 'r-dini', kind: 'task', area: 'spiritual', is_untracked: true, target_count: 10 }),
      routine({ id: 'r-dini-blok', kind: 'block', area: 'spiritual', is_untracked: true }),
    ],
    progress: { 'r-dini': 2 },
  }))
  assert.deepEqual(facts.items.map((i) => [i.key, i.expected, i.program]), [
    ['block:namaz', false, null],
    ['task:dua', false, null],
  ])
})

test('haftalık esnek alışkanlık: bugün beklenmez, hafta ilerlemesi bugüne kadar sayılır', () => {
  const facts = buildDayFacts(input({
    routines: [routine({ id: 'spor', title: 'Spor', area: 'health', times_per_week: 3 })],
    completions: [
      { routine_id: 'spor', completed_on: '2026-10-04', count: 1 }, // geçen hafta (Pazar)
      { routine_id: 'spor', completed_on: '2026-10-05', count: 1 },
      { routine_id: 'spor', completed_on: '2026-10-07', count: 1 },
      { routine_id: 'spor', completed_on: '2026-10-08', count: 1 }, // bugünden sonra
    ],
  }))
  assert.equal(facts.items[0]?.expected, false)
  assert.equal(facts.items[0]?.outcome, 'done')
  assert.deepEqual(facts.habits_week, [{ routine_id: 'spor', title: 'Spor', done: 2, target: 3 }])
})

test('günde N kez alışkanlık: bugün beklenir, sayaç N olmadan tamamlanmış sayılmaz', () => {
  const water = routine({ id: 'su', title: 'Su', times_per_week: 7, times_per_day: 5 })
  const partial = buildDayFacts(input({
    routines: [water],
    completions: [
      { routine_id: 'su', completed_on: '2026-10-06', count: 5 },
      { routine_id: 'su', completed_on: DATE, count: 3 },
    ],
  }))
  assert.equal(partial.items[0]?.expected, true)
  assert.equal(partial.items[0]?.outcome, 'open')
  assert.equal(partial.habits_week[0]?.done, 1)

  const full = buildDayFacts(input({ routines: [water], completions: [{ routine_id: 'su', completed_on: DATE, count: 5 }] }))
  assert.equal(full.items[0]?.outcome, 'done')
})

test('pasif, bitmiş ve henüz başlamamış alışkanlık görünmez', () => {
  const facts = buildDayFacts(input({
    routines: [
      routine({ id: 'pasif', is_active: false }),
      routine({ id: 'bitti', ends_on: '2026-10-06' }),
      routine({ id: 'baslamadi', starts_on: '2026-10-08' }),
      routine({ id: 'blok-rutini', kind: 'block' }),
    ],
  }))
  assert.deepEqual(facts.items, [])
})

test('sıralama: saatliler saate göre, saatsizler sonda', () => {
  const facts = buildDayFacts(input({
    tasks: [task({ id: 'saatsiz', title: 'B görev' })],
    blocks: [
      block({ id: 'ogle', start_time: '13:00:00', end_time: '14:00:00' }),
      block({ id: 'sabah', start_time: '08:00:00', end_time: '09:00:00' }),
    ],
    routines: [routine({ id: 'su', times_per_week: 7 })],
  }))
  assert.deepEqual(facts.items.map((i) => i.key), ['block:sabah', 'block:ogle', 'task:saatsiz', 'habit:su'])
})

test('hareket, odak, beslenme, enerji', () => {
  const facts = buildDayFacts(input({
    energy: 2,
    focusMinutes: 75,
    health: { steps: 9100, exercise_minutes: 35, workout_count: 0 },
    workoutCompleted: true,
    meals: [
      { total_calories: 600, total_protein: '30.4' },
      { total_calories: 850, total_protein: 41 },
    ],
    calorieTarget: 2200,
  }))
  assert.equal(facts.energy, 2)
  assert.equal(facts.focus_minutes, 75)
  assert.deepEqual(facts.movement, { exercise_minutes: 35, steps: 9100, workout_done: true })
  assert.deepEqual(facts.nutrition, { calories: 1450, calorie_target: 2200, protein_g: 71, meals: 2 })
  assert.equal(facts.generated_at, '2026-10-07T18:00:00.000Z')
})

test('veri yokken: öğün yoksa beslenme null, antrenman yok, hareket değerleri null', () => {
  const facts = buildDayFacts(input())
  assert.equal(facts.nutrition, null)
  assert.deepEqual(facts.movement, { exercise_minutes: null, steps: null, workout_done: false })
  assert.deepEqual(facts.items, [])
  assert.equal(buildDayFacts(input({ health: { steps: null, exercise_minutes: null, workout_count: 2 } })).movement.workout_done, true)
})

test('tarih yardımcıları: gerçek takvim günü ve geçerli dilim', () => {
  assert.equal(isIsoDate('2026-10-07'), true)
  assert.equal(isIsoDate('2026-02-30'), false)
  assert.equal(isIsoDate('2026-1-7'), false)
  assert.equal(isIsoDate(20261007), false)
  assert.equal(isValidTimeZone('Europe/Istanbul'), true)
  assert.equal(isValidTimeZone('Mars/Olympus'), false)
  assert.equal(isValidTimeZone(''), false)
})

test('yerel gün sınırları: İstanbul (UTC+3) ve yaz saati geçişi olan gün', () => {
  assert.deepEqual(dayBoundsUtc('2026-10-07', 'Europe/Istanbul'), {
    start: '2026-10-06T21:00:00.000Z',
    end: '2026-10-07T21:00:00.000Z',
  })
  // ABD'de 8 Mart 2026 yaz saatine geçiş günü: 23 saatlik gün.
  assert.deepEqual(dayBoundsUtc('2026-03-08', 'America/New_York'), {
    start: '2026-03-08T05:00:00.000Z',
    end: '2026-03-09T04:00:00.000Z',
  })
})

test('yerel tarih: UTC günü değişmemişken İstanbul günü ilerlemiş olabilir', () => {
  const at = new Date('2026-10-06T22:30:00Z')
  assert.equal(localDateIn('Europe/Istanbul', at), '2026-10-07')
  assert.equal(localDateIn('America/New_York', at), '2026-10-06')
})
