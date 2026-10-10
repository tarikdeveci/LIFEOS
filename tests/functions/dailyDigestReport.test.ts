import { test } from 'node:test'
import assert from 'node:assert/strict'

import { pickDailyBrief } from '../../supabase/functions/_shared/brief.ts'
import type { DailyBrief } from '../../supabase/functions/_shared/brief.ts'
import type { DaySummary } from '../../supabase/functions/_shared/report/narrative.ts'
import { dayContext } from '../../supabase/functions/daily-digest/copy.ts'
import { toBriefInput, type MorningRows } from '../../supabase/functions/daily-digest/morning.ts'
import { eveningReportCopy, morningBriefCopy } from '../../supabase/functions/daily-digest/reportCopy.ts'

const UID = '3f2b8c1e-0a4d-4c52-9f6e-1d2a3b4c5d6e'
// 2026-10-07 Çarşamba. Başlıkta haftanın gününe özel metin yok.
const ctx = (date = '2026-10-07') => dayContext(UID, date)

const summary = (over: Partial<DaySummary> = {}): DaySummary => ({ total: 5, done: 3, partial: 0, skipped: 0, open: 2, ...over })

const dates = ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12']

test('akşam bildirimi: sayılar özetten gelir, rapora yönlendirir', () => {
  const copy = eveningReportCopy(summary(), ctx())
  assert.ok(copy.title.length > 0)
  assert.match(copy.body, /raporda|Raporda|rapora/i)
  const bodies = new Set(dates.map((d) => eveningReportCopy(summary(), ctx(d)).body))
  assert.ok([...bodies].some((b) => /3\/5|3 iş/.test(b)))
})

test('akşam bildirimi: tamam, kısmi, hiç ve plansız gün için ayrı havuzlar', () => {
  const all = eveningReportCopy(summary({ total: 4, done: 4, open: 0 }), ctx()).body
  const none = eveningReportCopy(summary({ total: 4, done: 0, open: 4 }), ctx()).body
  const empty = eveningReportCopy(summary({ total: 0, done: 0, open: 0 }), ctx()).body
  assert.match(all, /4/)
  assert.ok(!/\d\/\d/.test(none))
  assert.ok(!/\d/.test(empty))
  assert.notEqual(all, none)
  assert.notEqual(none, empty)
})

test('akşam bildirimi: öğün olmasa da metin üretir ve güne göre değişir, aynı gün aynı kalır', () => {
  const titles = new Set(dates.map((d) => eveningReportCopy(summary(), ctx(d)).title))
  assert.ok(titles.size >= 3)
  assert.deepEqual(eveningReportCopy(summary(), ctx()), eveningReportCopy(summary(), ctx()))
})

test('akşam bildirimi: cuma başlığı haftanın gününe özel metni iki günden birinde kullanır', () => {
  const fridays = ['2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30']
  const titles = fridays.map((d) => eveningReportCopy(summary(), ctx(d)).title)
  assert.ok(titles.includes('Haftanın son raporu hazır'))
})

const task = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: `Görev ${id}`,
  status: 'planned',
  area: null,
  routine_id: null,
  estimated_minutes: null,
  goal_id: null,
  priority_score: 2,
  created_at: '2026-10-01T08:00:00Z',
  ...over,
})

const rows = (over: Partial<MorningRows> = {}): MorningRows => ({
  tasks: [],
  blocks: [],
  routines: [],
  completions: [],
  goalCaps: {},
  maxDeepTasks: 3,
  ...over,
} as MorningRows)

test('sabah satırları: biten iş elenir, alan rutinden çözülür, alışkanlık haftası hesaplanır', () => {
  const input = toBriefInput(
    rows({
      tasks: [
        task('a', { status: 'done' }),
        task('b', { routine_id: 'r-saglik' }),
        task('c', { area: 'career' }),
      ] as MorningRows['tasks'],
      blocks: [
        { id: 'k1', task_id: null, label: null, block_type: 'routine', start_time: '07:30:00', end_time: '08:00:00', routine_id: 'r-saglik', completed_at: null },
        { id: 'k2', task_id: null, label: 'Bitti', block_type: 'focus', start_time: '09:00:00', end_time: '10:00:00', routine_id: null, completed_at: '2026-10-07T10:00:00Z' },
      ],
      routines: [
        { id: 'r-saglik', title: 'Yürüyüş', kind: 'block', area: 'health', times_per_week: null, times_per_day: null, estimated_minutes: null, target_count: null, is_untracked: false, is_active: true, starts_on: '2026-09-01', ends_on: null },
        { id: 'r-spor', title: 'Spor', kind: 'habit', area: 'health', times_per_week: 3, times_per_day: null, estimated_minutes: null, target_count: null, is_untracked: false, is_active: true, starts_on: '2026-09-01', ends_on: null },
        { id: 'r-dua', title: 'Dua', kind: 'habit', area: 'spiritual', times_per_week: 4, times_per_day: null, estimated_minutes: null, target_count: null, is_untracked: true, is_active: true, starts_on: '2026-09-01', ends_on: null },
      ],
      completions: [
        { routine_id: 'r-spor', completed_on: '2026-10-05', count: 1 },
        { routine_id: 'r-spor', completed_on: '2026-10-07', count: 1 },
        { routine_id: 'r-spor', completed_on: '2026-10-03', count: 1 },
      ],
    }),
    '2026-10-07',
  )
  assert.deepEqual(input.tasks.map((t) => [t.id, t.area]), [['b', 'health'], ['c', 'career']])
  assert.deepEqual(input.blocks.map((b) => [b.id, b.label, b.area, b.start_time]), [['k1', 'Yürüyüş', 'health', '07:30']])
  const spor = input.habits.find((h) => h.routine_id === 'r-spor')
  assert.deepEqual([spor?.week_done, spor?.week_target, spor?.done_today], [2, 3, true])
  assert.equal(input.habits.find((h) => h.routine_id === 'r-dua')?.is_untracked, true)
})

test('sabah özeti: pickDailyBrief çıktısı 3 öncelik, bakım ve manevi satırına dönüşür', () => {
  const brief = pickDailyBrief(
    toBriefInput(
      rows({
        tasks: [task('1', { priority_score: 3 }), task('2', { priority_score: 2 }), task('3', { priority_score: 1 }), task('4', { priority_score: 0.5 })] as MorningRows['tasks'],
        blocks: [
          { id: 'sp', task_id: null, label: 'Spor', block_type: 'workout', start_time: '18:00:00', end_time: '19:00:00', routine_id: null, completed_at: null },
          { id: 'ns', task_id: null, label: 'Cuma namazı', block_type: 'routine', start_time: '13:00:00', end_time: '13:45:00', routine_id: 'r-dini', completed_at: null },
        ],
        routines: [
          { id: 'r-dini', title: 'Cuma namazı', kind: 'block', area: 'spiritual', times_per_week: null, times_per_day: null, estimated_minutes: null, target_count: null, is_untracked: true, is_active: true, starts_on: '2026-09-01', ends_on: null },
        ],
      }),
      '2026-10-07',
    ),
  )
  const copy = morningBriefCopy(brief, ctx())
  assert.ok(copy)
  const body = copy?.body.split('\n') ?? []
  assert.deepEqual(body.slice(0, 3), ['1. Görev 1', '2. Görev 2', '3. Görev 3'])
  assert.match(body[3] ?? '', /Spor \(18:00\)/)
  assert.match(body[4] ?? '', /Cuma namazı \(13:00\)/)
  assert.equal(body.length, 5)
  assert.match(copy?.title ?? '', /3|önceliği|Bugün/)
})

test('sabah özeti: öncelik yoksa null (eski sabah metnine düşülür)', () => {
  const empty: DailyBrief = { priorities: [], care: { key: 'task:x', title: 'Spor', area: 'health', start_time: null, done: false }, spirit: null }
  assert.equal(morningBriefCopy(empty, ctx()), null)
  const allDone: DailyBrief = { priorities: [{ key: 'task:a', title: 'A', area: null, start_time: null, done: true }], care: null, spirit: null }
  assert.equal(morningBriefCopy(allDone, ctx()), null)
})

test('sabah özeti: tek öncelik, adsız öğe atlanır, uzun başlık kısalır', () => {
  const brief: DailyBrief = {
    priorities: [
      { key: 'block:1', title: '  ', area: null, start_time: null, done: false },
      { key: 'task:2', title: 'U'.repeat(80), area: null, start_time: null, done: false },
    ],
    care: null,
    spirit: null,
  }
  const copy = morningBriefCopy(brief, ctx())
  assert.equal(copy?.body.split('\n').length, 1)
  assert.ok((copy?.body.length ?? 0) < 50)
  assert.ok(!/\d/.test(copy?.title ?? '1'), 'tek öncelikte başlıkta sayı yok')
})

test('sabah özeti: her gün değişir, aynı gün aynı kalır', () => {
  const brief: DailyBrief = {
    priorities: [{ key: 'task:a', title: 'A', area: null, start_time: null, done: false }, { key: 'task:b', title: 'B', area: null, start_time: null, done: false }],
    care: { key: 'task:c', title: 'Spor', area: 'health', start_time: null, done: false },
    spirit: null,
  }
  const titles = new Set(dates.map((d) => morningBriefCopy(brief, ctx(d))?.title))
  assert.ok(titles.size >= 3)
  assert.deepEqual(morningBriefCopy(brief, ctx()), morningBriefCopy(brief, ctx()))
})

test('bildirim metinleri: uzun ve orta tire yok', () => {
  const texts: string[] = []
  for (const d of [...dates, '2026-10-16', '2026-10-17']) {
    const c = ctx(d)
    for (const s of [summary(), summary({ done: 5, open: 0 }), summary({ done: 0, open: 5 }), summary({ total: 0, done: 0, open: 0 })]) {
      const copy = eveningReportCopy(s, c)
      texts.push(copy.title, copy.body)
    }
    for (const n of [1, 2, 3]) {
      const priorities = Array.from({ length: n }, (_, i) => ({ key: `task:${i}`, title: `İş ${i}`, area: null, start_time: '10:00', done: false }))
      const copy = morningBriefCopy({ priorities, care: { key: 'task:x', title: 'Spor', area: 'health', start_time: null, done: false }, spirit: { key: 'task:y', title: 'Dua', area: 'spiritual', start_time: null, done: false } }, c)
      texts.push(copy?.title ?? '', copy?.body ?? '')
    }
  }
  assert.ok(texts.length > 50)
  for (const text of texts) {
    assert.ok(!/[\u2013\u2014]/.test(text), `tire var: ${text}`)
    assert.ok(!/[\d}]'[\p{L}]/u.test(text), `sayıdan sonra ek var: ${text}`)
  }
})
