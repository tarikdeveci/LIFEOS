import { test } from 'node:test'
import assert from 'node:assert/strict'

import { assignProgramDays } from '../../packages/shared/src/utils/programSchedule.ts'
import type { ProgramDay, Workout, WorkoutProgram } from '../../packages/shared/src/types/workout.ts'

const day = (id: string, n: number, name: string, is_rest = false): ProgramDay =>
  ({ id, program_id: 'p', day_number: n, day_name: name, is_rest })

const abc: WorkoutProgram = {
  id: 'p', user_id: 'u', name: 'Full Body', description: null, split_type: 'full_body', frequency_per_week: 3, created_at: '',
  days: [day('a', 1, 'A'), day('b', 2, 'B'), day('c', 3, 'C')],
}

const workout = (date: string, name: string | null, status: Workout['status'] = 'completed'): Workout =>
  ({ id: date + name, user_id: 'u', date, name, notes: null, status, duration_minutes: null, total_calories_burned: null, ai_plan: [], created_at: `${date}T10:00:00Z`, updated_at: '' })

const block = (id: string, date: string) => ({ id, date, start_time: '18:00:00' })
const label = (d: ProgramDay) => d.day_name
const ids = (m: Map<string, ProgramDay>, keys: string[]) => keys.map((k) => m.get(k)?.id ?? null)

test('programSchedule: antrenman yoksa bloklar programın ilk gününden sırayla düşer ve başa döner', () => {
  const blocks = ['2026-11-16', '2026-11-18', '2026-11-20', '2026-11-23'].map((d) => block(d, d))
  const res = assignProgramDays(abc, [], blocks, '2026-11-15', label)
  assert.deepEqual(ids(res, blocks.map((b) => b.id)), ['a', 'b', 'c', 'a'])
})

test('programSchedule: son yapılan günden sonraki gün ilk blokta görünür', () => {
  const blocks = [block('x', '2026-11-16'), block('y', '2026-11-18')]
  const res = assignProgramDays(abc, [workout('2026-11-14', 'Full Body · A')], blocks, '2026-11-15', label)
  assert.deepEqual(ids(res, ['x', 'y']), ['b', 'c'])
})

test('programSchedule: kaçırılan blok sıradaki günü kaydırmaz', () => {
  // A yapıldı (11-10), 11-12 ve 11-14 blokları kaçırıldı: bugün (11-15) hâlâ B sırada.
  const blocks = [block('past1', '2026-11-12'), block('past2', '2026-11-14'), block('today', '2026-11-15'), block('next', '2026-11-17')]
  const res = assignProgramDays(abc, [workout('2026-11-10', 'Full Body · A')], blocks, '2026-11-15', label)
  assert.equal(res.has('past1'), false)
  assert.equal(res.has('past2'), false)
  assert.deepEqual(ids(res, ['today', 'next']), ['b', 'c'])
})

test('programSchedule: atlanan ve ileri tarihli antrenman sırayı ilerletmez', () => {
  const history = [
    workout('2026-11-14', 'Full Body · B', 'skipped'),
    workout('2026-11-20', 'Full Body · C', 'planned'),
    workout('2026-11-12', 'Full Body · A'),
  ]
  const res = assignProgramDays(abc, history, [block('today', '2026-11-15')], '2026-11-15', label)
  assert.equal(res.get('today')?.id, 'b')
})

test('programSchedule: bugün antrenman yapıldıysa bugünün bloğu o günü, sonraki blok bir sonrakini gösterir', () => {
  const blocks = [block('today', '2026-11-15'), block('next', '2026-11-17')]
  const res = assignProgramDays(abc, [workout('2026-11-15', 'Full Body · B')], blocks, '2026-11-15', label)
  assert.deepEqual(ids(res, ['today', 'next']), ['b', 'c'])
})

test('programSchedule: başka programın antrenmanı ve ad öneki karışmaz', () => {
  const history = [workout('2026-11-14', 'Full Body 2 · B'), workout('2026-11-13', 'Push · B')]
  const res = assignProgramDays(abc, history, [block('x', '2026-11-16')], '2026-11-15', label)
  assert.equal(res.get('x')?.id, 'a')
})

test('programSchedule: dinlenme günü sayılmaz, çalışma günü yoksa boş döner', () => {
  const withRest: WorkoutProgram = { ...abc, days: [day('a', 1, 'A'), day('r', 2, 'Dinlenme', true), day('b', 3, 'B')] }
  const res = assignProgramDays(withRest, [], [block('x', '2026-11-16'), block('y', '2026-11-17')], '2026-11-15', label)
  assert.deepEqual(ids(res, ['x', 'y']), ['a', 'b'])
  assert.equal(assignProgramDays({ ...abc, days: [] }, [], [block('x', '2026-11-16')], '2026-11-15', label).size, 0)
})

test('programSchedule: aynı gündeki iki blok saate göre sıralanır', () => {
  const blocks = [{ id: 'late', date: '2026-11-16', start_time: '20:00' }, { id: 'early', date: '2026-11-16', start_time: '07:00' }]
  const res = assignProgramDays(abc, [], blocks, '2026-11-15', label)
  assert.deepEqual(ids(res, ['early', 'late']), ['a', 'b'])
})

test('programSchedule: bugünün ikinci bloğu yapılan günü tekrarlamaz, sıradakini alır', () => {
  const blocks = [{ id: 'am', date: '2026-11-15', start_time: '07:00' }, { id: 'pm', date: '2026-11-15', start_time: '19:00' }]
  const res = assignProgramDays(abc, [workout('2026-11-15', 'Full Body · A')], blocks, '2026-11-15', label)
  assert.deepEqual(ids(res, ['am', 'pm']), ['a', 'b'])
})
