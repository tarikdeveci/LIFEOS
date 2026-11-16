import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { Task } from '@lifeos/shared'
import { filterTasks, sortTasks } from '../../apps/mobile/src/lib/taskFilters.ts'

const TODAY = '2026-11-16'
const WEEK = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']

function task(id: string, fields: Partial<Task>): Task {
  return { id, status: 'planned', scheduled_date: null, due_date: null, priority_score: 1, created_at: '2026-11-01T00:00:00Z', ...fields } as Task
}

const tasks = [
  task('bugun', { scheduled_date: TODAY, priority_score: 2 }),
  task('hafta', { scheduled_date: '2026-11-19', due_date: '2026-11-18', priority_score: 3 }),
  task('gecikmis', { scheduled_date: '2026-11-10', created_at: '2026-11-15T00:00:00Z' }),
  task('son-tarih-gecti', { due_date: '2026-11-12', priority_score: 4 }),
  task('bitti-gecikmis', { scheduled_date: '2026-11-10', status: 'done' }),
  task('tarihsiz', { priority_score: 5, created_at: '2026-11-14T00:00:00Z' }),
]

const ids = (list: Task[]) => list.map((t) => t.id)

test('filterTasks: bugün ve bu hafta planlanan güne bakar', () => {
  assert.deepEqual(ids(filterTasks(tasks, 'today', TODAY, WEEK)), ['bugun'])
  assert.deepEqual(ids(filterTasks(tasks, 'week', TODAY, WEEK)), ['bugun', 'hafta'])
})

test('filterTasks: gecikmiş, bitmemiş ve planı ya da son tarihi geçmiş görevdir', () => {
  assert.deepEqual(ids(filterTasks(tasks, 'overdue', TODAY, WEEK)), ['gecikmis', 'son-tarih-gecti'])
})

test('filterTasks: tarihsiz iki tarihi de boş olandır, tümü filtrelemez', () => {
  assert.deepEqual(ids(filterTasks(tasks, 'unscheduled', TODAY, WEEK)), ['tarihsiz'])
  assert.equal(filterTasks(tasks, 'all', TODAY, WEEK).length, tasks.length)
})

test('sortTasks: öncelik azalan, son tarih artan ve tarihsiz sonda, oluşturma yeniden eskiye', () => {
  assert.deepEqual(ids(sortTasks(tasks, 'priority')).slice(0, 3), ['tarihsiz', 'son-tarih-gecti', 'hafta'])
  const byDue = ids(sortTasks(tasks, 'due'))
  assert.deepEqual(byDue.slice(0, 2), ['gecikmis', 'bitti-gecikmis'])
  assert.equal(byDue.at(-1), 'tarihsiz')
  assert.deepEqual(ids(sortTasks(tasks, 'created')).slice(0, 2), ['gecikmis', 'tarihsiz'])
})

test('sortTasks: girdiyi değiştirmez', () => {
  const before = ids(tasks)
  sortTasks(tasks, 'priority')
  assert.deepEqual(ids(tasks), before)
})
