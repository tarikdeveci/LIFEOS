import { test } from 'node:test'
import assert from 'node:assert/strict'

import { postponedRows, summarize, viewItems } from '../../packages/shared/src/utils/dayReport.ts'
import { applyCheckin, summarizeDay } from '../../supabase/functions/_shared/report/narrative.ts'
import type { DailyReport } from '../../packages/shared/src/types/report.ts'
import type { DayCheckin, DayFacts, DayItem } from '../../supabase/functions/_shared/report/types.ts'

// Rapor halkası (dayReport) ve sunucu anlatısı (narrative) aynı günü aynı sayılarla saymalı.

const item = (over: Partial<DayItem> & { key: string }): DayItem => ({
  kind: over.key.startsWith('habit:') ? 'habit' : over.key.startsWith('block:') ? 'block' : 'task',
  title: over.key,
  area: null,
  minutes: null,
  start_time: null,
  expected: true,
  outcome: 'open',
  reason: null,
  program: null,
  untracked: false,
  goal: null,
  ...over,
})

const facts = (items: DayItem[]): DayFacts => ({
  date: '2026-10-07',
  energy: null,
  items,
  focus_minutes: 0,
  movement: { exercise_minutes: null, steps: null, workout_done: false },
  nutrition: null,
  habits_week: [],
  generated_at: '2026-10-07T18:00:00.000Z',
})

function both(day: DayFacts, checkin: DayCheckin) {
  const server = summarizeDay(applyCheckin(day, checkin))
  const report = { facts: day, checkin } as unknown as DailyReport
  const mobile = summarize(viewItems(report))
  return { server, mobile }
}

function assertSame(day: DayFacts, checkin: DayCheckin) {
  const { server, mobile } = both(day, checkin)
  assert.deepEqual(
    { total: mobile.total, done: mobile.done, partial: mobile.partial, skipped: mobile.skipped, open: mobile.open },
    server,
  )
}

test('işaretsiz gün: sayılar eşit', () => {
  const day = facts([item({ key: 'task:a', outcome: 'done' }), item({ key: 'task:b' }), item({ key: 'habit:c' })])
  assertSame(day, {})
})

test('yarım ve olmadı işaretleri açık öğelere aynı işlenir, done işaretin önüne geçer', () => {
  const day = facts([
    item({ key: 'task:a', outcome: 'done' }),
    item({ key: 'task:b' }),
    item({ key: 'task:c' }),
    item({ key: 'task:d' }),
  ])
  const checkin: DayCheckin = {
    items: {
      'task:a': { outcome: 'skipped', reason: 'energy' },
      'task:b': { outcome: 'partial' },
      'task:c': { outcome: 'skipped', reason: 'time' },
    },
  }
  assertSame(day, checkin)
  assert.equal(both(day, checkin).mobile.done, 1)
})

test('manevi ve ölçülmeyen iş iki tarafta da sayıya girmez', () => {
  const day = facts([
    item({ key: 'task:a', outcome: 'done' }),
    item({ key: 'habit:dua', area: 'spiritual', outcome: 'done' }),
    item({ key: 'habit:yoga', untracked: true, outcome: 'open' }),
    item({ key: 'task:b', area: 'spiritual' }),
    item({ key: 'task:c' }),
  ])
  const checkin: DayCheckin = { items: { 'task:b': { outcome: 'partial' }, 'habit:yoga': { outcome: 'skipped' }, 'task:c': { outcome: 'partial' } } }
  assertSame(day, checkin)
  assert.equal(both(day, checkin).mobile.total, 2)
})

test('beklenmeyen (haftalık esnek) iş sayılmaz', () => {
  const day = facts([item({ key: 'habit:a', expected: false, outcome: 'done' }), item({ key: 'task:b', outcome: 'done' })])
  assertSame(day, {})
})

test('postponedRows: aynı başlıklı iki öğenin notu sırayla eşlenir, quiet öğe gösterilmez', () => {
  const day = facts([
    item({ key: 'task:1', title: 'Rapor', outcome: 'partial' }),
    item({ key: 'task:2', title: 'Rapor', outcome: 'skipped' }),
    item({ key: 'habit:3', title: 'Dua', area: 'spiritual', outcome: 'skipped' }),
    item({ key: 'task:4', title: 'Bitti', outcome: 'done' }),
  ])
  const narrative = {
    source: 'ai', headline: '', went_well: [], suggestion: '', future_self: '',
    postponed: [{ title: 'Rapor', note: 'ilk' }, { title: 'Rapor', note: 'ikinci' }, { title: 'Dua', note: 'gizli' }, { title: 'Bitti', note: 'bayat' }],
  } as const
  const report = { facts: day, checkin: {} } as unknown as DailyReport
  const rows = postponedRows(viewItems(report), { ...narrative, postponed: [...narrative.postponed] })
  assert.deepEqual(rows.map((r) => [r.key, r.note]), [['task:1', 'ilk'], ['task:2', 'ikinci']])
})
