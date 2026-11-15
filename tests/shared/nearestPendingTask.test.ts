import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nearestPendingTask, taskDateKey } from '../../packages/shared/src/utils/priority.ts'

const task = (id: string, over: Partial<{ status: string; priority_score: number; scheduled_date: string | null; due_date: string | null }> = {}) => ({
  id, status: 'planned', priority_score: 1.5, scheduled_date: null, due_date: null, ...over,
})

test('taskDateKey en erken tarihi verir', () => {
  assert.equal(taskDateKey({ scheduled_date: '2026-11-20', due_date: '2026-11-18' }), '2026-11-18')
  assert.equal(taskDateKey({ scheduled_date: null, due_date: null }), null)
})

test('tarihli görev tarihsizden önce, erken tarih önce', () => {
  const r = nearestPendingTask([
    task('a', { priority_score: 3 }),
    task('b', { scheduled_date: '2026-11-20' }),
    task('c', { due_date: '2026-11-17' }),
  ])
  assert.equal(r?.id, 'c')
})

test('geciken görev bugünden önce gelir', () => {
  const r = nearestPendingTask([task('today', { scheduled_date: '2026-11-15' }), task('late', { due_date: '2026-11-10' })])
  assert.equal(r?.id, 'late')
})

test('aynı tarihte yüksek öncelik, tarihsizde en yüksek öncelik', () => {
  assert.equal(nearestPendingTask([task('lo', { scheduled_date: '2026-11-16', priority_score: 1 }), task('hi', { scheduled_date: '2026-11-16', priority_score: 2 })])?.id, 'hi')
  assert.equal(nearestPendingTask([task('lo', { priority_score: 1 }), task('hi', { priority_score: 2.5 })])?.id, 'hi')
})

test('bitmiş, ertelenmiş ve engelli görevler sayılmaz', () => {
  const r = nearestPendingTask([
    task('done', { status: 'done', due_date: '2026-11-01' }),
    task('deferred', { status: 'deferred', due_date: '2026-11-02' }),
    task('blocked', { status: 'blocked', due_date: '2026-11-03' }),
  ])
  assert.equal(r, null)
})
