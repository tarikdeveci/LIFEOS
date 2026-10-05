import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { pickDailyBrief } from '../../packages/shared/src/utils/dailyBrief.ts'
import type { BriefBlock, BriefHabit, BriefInput, BriefTask } from '../../packages/shared/src/utils/dailyBrief.ts'

const task = (over: Partial<BriefTask> & { id: string }): BriefTask => ({
  title: over.id,
  area: null,
  status: 'planned',
  priority_score: 1.5,
  goal_id: null,
  created_at: '2026-10-01T08:00:00Z',
  ...over,
})

const block = (over: Partial<BriefBlock> & { id: string }): BriefBlock => ({
  task_id: null,
  label: over.id,
  block_type: 'routine',
  start_time: '09:00',
  routine_id: null,
  area: null,
  completed_at: null,
  ...over,
})

const habit = (over: Partial<BriefHabit> & { routine_id: string }): BriefHabit => ({
  title: over.routine_id,
  area: 'health',
  is_untracked: false,
  week_done: 0,
  week_target: 3,
  done_today: false,
  ...over,
})

const input = (over: Partial<BriefInput> = {}): BriefInput => ({
  tasks: [],
  blocks: [],
  habits: [],
  goalCaps: {},
  maxDeepTasks: 3,
  ...over,
})

const keys = (items: { key: string }[]): string[] => items.map((i) => i.key)

test('öncelikler puana göre sıralanır ve en çok 3 tanedir', () => {
  const brief = pickDailyBrief(input({
    tasks: [
      task({ id: 'a', priority_score: 1 }),
      task({ id: 'b', priority_score: 4 }),
      task({ id: 'c', priority_score: 2 }),
      task({ id: 'd', priority_score: 3 }),
    ],
  }))
  assert.deepEqual(keys(brief.priorities), ['task:b', 'task:d', 'task:c'])
})

test('max_deep_tasks 3 altındaysa uygulanır, üstündeyse 3 ile sınırlanır', () => {
  const tasks = ['a', 'b', 'c', 'd'].map((id) => task({ id }))
  assert.equal(pickDailyBrief(input({ tasks, maxDeepTasks: 2 })).priorities.length, 2)
  assert.equal(pickDailyBrief(input({ tasks, maxDeepTasks: 5 })).priorities.length, 3)
  assert.equal(pickDailyBrief(input({ tasks, maxDeepTasks: 0 })).priorities.length, 3)
})

test('eşit puanda erken saatli iş öne geçer, saatsiz sona kalır', () => {
  const brief = pickDailyBrief(input({
    tasks: [task({ id: 'saatsiz' }), task({ id: 'ogle' }), task({ id: 'sabah' })],
    blocks: [
      block({ id: 'b1', task_id: 'ogle', block_type: 'task', start_time: '13:00' }),
      block({ id: 'b2', task_id: 'sabah', block_type: 'task', start_time: '09:00' }),
    ],
  }))
  assert.deepEqual(keys(brief.priorities), ['task:sabah', 'task:ogle', 'task:saatsiz'])
  assert.equal(brief.priorities[0]?.start_time, '09:00')
})

test('hedefin günlük tavanı aşılmaz', () => {
  const brief = pickDailyBrief(input({
    tasks: [
      task({ id: 'claude1', goal_id: 'g', priority_score: 5 }),
      task({ id: 'claude2', goal_id: 'g', priority_score: 4 }),
      task({ id: 'basvuru', priority_score: 2 }),
    ],
    goalCaps: { g: 1 },
  }))
  assert.deepEqual(keys(brief.priorities), ['task:claude1', 'task:basvuru'])
})

test('biten iş listede kalır, ertelenen çıkar', () => {
  const brief = pickDailyBrief(input({
    tasks: [task({ id: 'bitti', status: 'done' }), task({ id: 'ertelendi', status: 'deferred' })],
  }))
  assert.deepEqual(keys(brief.priorities), ['task:bitti'])
  assert.equal(brief.priorities[0]?.done, true)
})

test('odak bloğu öncelik adayıdır, mola ve yemek bloğu değildir', () => {
  const brief = pickDailyBrief(input({
    blocks: [
      block({ id: 'odak', block_type: 'focus', start_time: '10:00' }),
      block({ id: 'ogle', block_type: 'meal', start_time: '12:00' }),
      block({ id: 'mola', block_type: 'break', start_time: '15:00' }),
    ],
  }))
  assert.deepEqual(keys(brief.priorities), ['block:odak'])
  assert.equal(brief.care, null)
})

test('bakım: planlı sağlık işi alışkanlıktan önce gelir', () => {
  const brief = pickDailyBrief(input({
    blocks: [block({ id: 'spor', block_type: 'workout', start_time: '18:00' })],
    habits: [habit({ routine_id: 'su' })],
  }))
  assert.equal(brief.care?.key, 'block:spor')
  assert.deepEqual(brief.priorities, [])
})

test('bakım: planlı iş yoksa haftalık hedefi dolmamış sağlık alışkanlığı', () => {
  const brief = pickDailyBrief(input({
    habits: [
      habit({ routine_id: 'doldu', week_done: 3 }),
      habit({ routine_id: 'bugun', done_today: true }),
      habit({ routine_id: 'kisisel', area: 'personal' }),
      habit({ routine_id: 'spor' }),
    ],
  }))
  assert.equal(brief.care?.key, 'habit:spor')
})

test('rutinli mola kişisel bakım sayılır', () => {
  const brief = pickDailyBrief(input({
    blocks: [block({ id: 'kendim', block_type: 'break', routine_id: 'r1', start_time: '21:00' })],
  }))
  assert.equal(brief.care?.key, 'block:kendim')
})

test('manevi: yalnızca bugüne planlanmış iş, sayaçsız alışkanlık itilmez', () => {
  const habits = [habit({ routine_id: 'dua', area: 'spiritual', is_untracked: true })]
  assert.equal(pickDailyBrief(input({ habits })).spirit, null)
  assert.equal(pickDailyBrief(input({ habits })).care, null)

  const brief = pickDailyBrief(input({
    habits,
    blocks: [block({ id: 'cuma', area: 'spiritual', start_time: '13:00' })],
    tasks: [task({ id: 'ara', area: 'social' })],
  }))
  assert.equal(brief.spirit?.key, 'block:cuma')
  assert.deepEqual(brief.priorities, [])
})

test('Deno kopyaları paylaşılan kaynakla aynı', () => {
  const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  assert.equal(
    read('../../supabase/functions/_shared/brief.ts'),
    read('../../packages/shared/src/utils/dailyBrief.ts'),
  )
  const body = (text: string): string => text.slice(text.indexOf('\nexport type DayOutcome'))
  assert.equal(
    body(read('../../supabase/functions/_shared/report/types.ts')),
    body(read('../../packages/shared/src/types/report.ts')),
  )
})
