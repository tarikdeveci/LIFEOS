import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  addMonths,
  goalPeriodEnd,
  goalPeriodStart,
  computeGoalProgress,
  goalTreeProgress,
  goalsNeedingReview,
  legacyWeeklyGoalsToInputs,
  valueScoreForGoal,
} from '../../packages/shared/src/utils/goals.ts'
import type { Goal, GoalTaskLike } from '../../packages/shared/src/types/goal.ts'

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  user_id: 'u',
  parent_id: null,
  horizon: 'week',
  title: 'Spor',
  icon: null,
  period_start: '2026-09-28',
  target: 3,
  unit: 'gün',
  count_mode: 'tasks',
  tag_filter: ['spor'],
  status: 'active',
  review_note: null,
  reviewed_at: null,
  created_at: '2026-09-28T00:00:00Z',
  updated_at: '2026-09-28T00:00:00Z',
  ...over,
})

const task = (over: Partial<GoalTaskLike> = {}): GoalTaskLike => ({
  goal_id: null,
  status: 'done',
  tags: [],
  estimated_minutes: null,
  scheduled_date: '2026-09-29',
  completed_at: null,
  ...over,
})

test('periyot başlangıcı: hafta Pazartesi, ay ilk gün, çeyrek ilk ay', () => {
  assert.equal(goalPeriodStart('week', '2026-10-04'), '2026-09-28')
  assert.equal(goalPeriodStart('month', '2026-09-30'), '2026-09-01')
  assert.equal(goalPeriodStart('quarter', '2026-09-30'), '2026-07-01')
  assert.equal(goalPeriodStart('quarter', '2026-10-01'), '2026-10-01')
})

test('periyot sonu ve kaydırma yıl sınırını aşar', () => {
  assert.equal(goalPeriodEnd('week', '2026-09-28'), '2026-10-04')
  assert.equal(goalPeriodEnd('month', '2026-02-01'), '2026-02-28')
  assert.equal(goalPeriodEnd('quarter', '2026-10-01'), '2026-12-31')
  assert.equal(addMonths('2026-11-01', 3), '2027-02-01')
  assert.equal(addMonths('2026-01-01', -1), '2025-12-01')
})

test('haftalık sayım: etiket veya goal_id, sadece tamamlanmış ve periyot içi', () => {
  const tasks = [
    task({ tags: ['spor'] }),
    task({ goal_id: 'g1' }),
    task({ tags: ['spor'], status: 'planned' }),
    task({ tags: ['spor'], scheduled_date: '2026-10-05' }),
    task({ tags: ['iş'] }),
  ]
  assert.deepEqual(computeGoalProgress(goal(), tasks), { current: 2, total: 3, pct: 67 })
})

test('saat modu dakikayı kesirli saate çevirir, tahmin yoksa 60 dk', () => {
  const g = goal({ count_mode: 'hours', target: 2 })
  const tasks = [task({ tags: ['spor'], estimated_minutes: 90 }), task({ tags: ['spor'] })]
  assert.deepEqual(computeGoalProgress(g, tasks), { current: 2.5, total: 2, pct: 100 })
})

test('saat modu: yüzde yuvarlanmış saatten değil gerçek süreden hesaplanır', () => {
  const g = goal({ count_mode: 'hours', target: 1 })
  assert.deepEqual(computeGoalProgress(g, [task({ tags: ['spor'], estimated_minutes: 30 })]), { current: 0.5, total: 1, pct: 50 })
  assert.equal(computeGoalProgress(g, [task({ tags: ['spor'], estimated_minutes: 25 })]).pct, 42)
})

test('planlanmamış görev tamamlandığı güne sayılır', () => {
  const tasks = [task({ tags: ['spor'], scheduled_date: null, completed_at: '2026-09-30T12:00:00' })]
  assert.equal(computeGoalProgress(goal(), tasks).current, 1)
})

test('oran modu: bırakılan alt hedef sayılmaz, bağlı görevler dahil', () => {
  const month = goal({ id: 'm', horizon: 'month', period_start: '2026-09-01', target: null, count_mode: null, tag_filter: [] })
  const children = [
    { status: 'done' as const, pct: 40 },
    { status: 'active' as const, pct: 100 },
    { status: 'active' as const, pct: 50 },
    { status: 'dropped' as const, pct: 0 },
  ]
  const tasks = [task({ goal_id: 'm' }), task({ goal_id: 'm', status: 'planned' })]
  assert.deepEqual(computeGoalProgress(month, tasks, children), { current: 3, total: 5, pct: 60 })
  assert.equal(computeGoalProgress({ ...month, status: 'done' }, [], []).pct, 100)
})

test('ağaç ilerlemesi haftadan çeyreğe yukarı akar', () => {
  const q = goal({ id: 'q', horizon: 'quarter', period_start: '2026-07-01', target: null, count_mode: null, tag_filter: [] })
  const m = goal({ id: 'm', parent_id: 'q', horizon: 'month', period_start: '2026-09-01', target: null, count_mode: null, tag_filter: [] })
  const w = goal({ id: 'w', parent_id: 'm', target: 1 })
  const progress = goalTreeProgress([q, m, w], [task({ tags: ['spor'] })])
  assert.equal(progress.get('w')?.pct, 100)
  assert.equal(progress.get('m')?.pct, 100)
  assert.equal(progress.get('q')?.pct, 100)
})

test('hedefe bağlanan görevin değer puanı en az 4', () => {
  assert.equal(valueScoreForGoal(2, 'g1'), 4)
  assert.equal(valueScoreForGoal(5, 'g1'), 5)
  assert.equal(valueScoreForGoal(2, null), 2)
})

test('değerlendirme: geçmiş ayın aktif ve değerlendirilmemiş hedefleri', () => {
  const goals = [
    goal({ id: 'a', horizon: 'month', period_start: '2026-08-01' }),
    goal({ id: 'b', horizon: 'month', period_start: '2026-08-01', reviewed_at: '2026-09-01T00:00:00Z' }),
    goal({ id: 'c', horizon: 'month', period_start: '2026-08-01', status: 'done' }),
    goal({ id: 'd', horizon: 'month', period_start: '2026-09-01' }),
    goal({ id: 'e', horizon: 'week', period_start: '2026-08-03' }),
  ]
  assert.deepEqual(goalsNeedingReview(goals, '2026-09-30').map((g) => g.id), ['a'])
})

test('eski localStorage hedefleri taşınır, bozuk kayıt atlanır', () => {
  const raw = [
    { id: 'sport', label: 'Spor', icon: '💪', target: 4, unit: 'gün', tagFilter: ['spor', ' '], countMode: 'tasks' },
    { label: '', target: 3, countMode: 'tasks' },
    { label: 'Okuma', target: 0, countMode: 'tasks' },
    { label: 'Kod', target: 8, countMode: 'minutes' },
    'bozuk',
  ]
  const out = legacyWeeklyGoalsToInputs(raw, '2026-09-28')
  assert.equal(out.length, 1)
  assert.deepEqual(out[0], {
    horizon: 'week', title: 'Spor', period_start: '2026-09-28', icon: '💪',
    target: 4, unit: 'gün', count_mode: 'tasks', tag_filter: ['spor'],
  })
  assert.deepEqual(legacyWeeklyGoalsToInputs(null, '2026-09-28'), [])
})
