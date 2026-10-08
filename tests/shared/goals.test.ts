import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  addMonths,
  goalPeriodEnd,
  goalPeriodStart,
  computeGoalProgress,
  goalTreeProgress,
  goalsNeedingReview,
  goalsToAutoComplete,
  legacyWeeklyGoalsToInputs,
  valueScoreForGoal,
} from '../../packages/shared/src/utils/goals.ts'
import type { Goal, GoalEntry, GoalTaskLike } from '../../packages/shared/src/types/goal.ts'

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
  daily_cap: null,
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

test('hedef taşıma yarıda kalıp tekrar denenince ikinci yeni hedef açılmaz', async () => {
  const { useGoalStore } = await import('../../packages/shared/src/stores/goalStore.ts')
  const inserts: unknown[] = []
  let updateFails = true
  const client = {
    from: () => ({
      insert: (rows: Record<string, unknown>[]) => {
        inserts.push(rows)
        return { select: async () => ({ data: rows.map((r, i) => ({ ...r, id: `new-${inserts.length}-${i}` })), error: null }) }
      },
      update: (patch: Record<string, unknown>) => ({
        eq: () => ({
          select: () => ({
            single: async () => (updateFails
              ? { data: null, error: { message: 'ağ' } }
              : { data: { id: 'old', ...patch }, error: null }),
          }),
        }),
      }),
    }),
  } as unknown as Parameters<ReturnType<typeof useGoalStore.getState>['reviewGoal']>[0]
  const old = {
    id: 'old', horizon: 'month', title: 'Koş', icon: null, period_start: '2026-09-01', parent_id: null,
    target: 4, unit: null, count_mode: 'tasks', tag_filter: [], status: 'active',
  } as unknown as Parameters<ReturnType<typeof useGoalStore.getState>['reviewGoal']>[2]
  useGoalStore.setState({ goals: [old], tasks: [] })

  await assert.rejects(useGoalStore.getState().reviewGoal(client, 'u', old, 'carry', '', '2026-10-05'))
  updateFails = false
  await useGoalStore.getState().reviewGoal(client, 'u', old, 'carry', '', '2026-10-05')
  assert.equal(inserts.length, 1)
})

type GoalStore = typeof import('../../packages/shared/src/stores/goalStore.ts').useGoalStore
type StepClient = Parameters<ReturnType<GoalStore['getState']>['addStep']>[0]

/** tasks ve task_details yazımlarını kaydeden sahte istemci; `failing.update` açıkken güncelleme hata döner. */
function stepClient() {
  const calls = { inserted: 0, updates: [] as Record<string, unknown>[], deleted: [] as string[] }
  const failing = { update: false }
  const client = {
    from: (table: string) => ({
      insert: (rows: Record<string, unknown>[]) => {
        const data = table === 'tasks'
          ? rows.map((r) => ({ id: `t${++calls.inserted}`, completed_at: null, ...r }))
          : null
        const result = { data, error: null }
        return { select: async () => result, then: (resolve: (value: typeof result) => void) => resolve(result) }
      },
      update: (patch: Record<string, unknown>) => ({
        eq: (_column: string, id: string) => ({
          select: () => ({
            single: async () => {
              if (failing.update) return { data: null, error: { message: 'ağ' } }
              if (table === 'tasks') calls.updates.push(patch)
              return { data: { id, ...patch }, error: null }
            },
          }),
        }),
      }),
      delete: () => ({
        eq: async (_column: string, id: string) => { calls.deleted.push(id); return { error: null } },
      }),
    }),
  }
  return { client: client as unknown as StepClient, calls, failing }
}

test('hedefe adım eklenir; tiklenince ilerleme artar, geri açılınca düşer', async () => {
  const { useGoalStore } = await import('../../packages/shared/src/stores/goalStore.ts')
  const { useTaskStore } = await import('../../packages/shared/src/stores/taskStore.ts')
  const g = goal({ target: null, count_mode: null, tag_filter: [] })
  useGoalStore.setState({ goals: [g], tasks: [] })
  useTaskStore.setState({ tasks: [] })
  const { client, calls } = stepClient()
  const pct = () => goalTreeProgress(useGoalStore.getState().goals, useGoalStore.getState().tasks).get('g1')?.pct

  await useGoalStore.getState().addStep(client, 'u', 'g1', 'İlk bölümü oku')
  const [step] = useGoalStore.getState().tasks
  assert.deepEqual({ id: step?.id, title: step?.title, goal_id: step?.goal_id, status: step?.status },
    { id: 't1', title: 'İlk bölümü oku', goal_id: 'g1', status: 'backlog' })
  assert.deepEqual(calls.updates, [{ goal_id: 'g1', value_score: 4 }])
  assert.equal(useTaskStore.getState().tasks[0]?.goal_id, 'g1', 'görev listesi de bağı görmeli')
  assert.equal(pct(), 0)

  await useGoalStore.getState().setStepDone(client, 't1', true)
  assert.equal(pct(), 100)
  assert.equal(calls.updates[1]?.status, 'done')

  await useGoalStore.getState().setStepDone(client, 't1', false)
  assert.equal(pct(), 0)
  assert.equal(calls.updates[2]?.status, 'backlog', 'takvimsiz adım backlog\'a döner')
})

test('adım yazılamazsa: tik geri alınır, bağlanamayan yeni adım silinir', async () => {
  const { useGoalStore } = await import('../../packages/shared/src/stores/goalStore.ts')
  const { useTaskStore } = await import('../../packages/shared/src/stores/taskStore.ts')
  const existing = { id: 's1', title: 'Koş', ...task({ goal_id: 'g1', status: 'planned' }) }
  useGoalStore.setState({ goals: [goal()], tasks: [existing] })
  useTaskStore.setState({ tasks: [] })
  const { client, calls, failing } = stepClient()
  failing.update = true

  await assert.rejects(useGoalStore.getState().setStepDone(client, 's1', true))
  assert.deepEqual(useGoalStore.getState().tasks, [existing])

  await assert.rejects(useGoalStore.getState().addStep(client, 'u', 'g1', 'Yeni adım'))
  assert.deepEqual(useGoalStore.getState().tasks, [existing])
  assert.deepEqual(calls.deleted, ['t1'])
  assert.deepEqual(useTaskStore.getState().tasks, [])
})

const entry = (over: Partial<GoalEntry> = {}): GoalEntry => ({
  id: 'e1', goal_id: 'g1', user_id: 'u', amount: 1.25,
  entry_date: '2026-09-29', note: null, created_at: '2026-09-29T12:00:00Z', ...over,
})

test('elle kayıt yalnız kendi hedefinin periyoduna eklenir; sınır günleri dahildir', () => {
  const entries = [entry({ entry_date: '2026-09-28' }), entry({ entry_date: '2026-10-04' }),
    entry({ entry_date: '2026-09-27', amount: 90 }), entry({ entry_date: '2026-10-05', amount: 90 }),
    entry({ goal_id: 'other', amount: 90 })]
  assert.deepEqual(computeGoalProgress(goal({ target: 5 }), [task({ goal_id: 'g1' })], [], entries),
    { current: 3.5, total: 5, pct: 70 })
  assert.deepEqual(computeGoalProgress(goal({ target: 5, count_mode: 'hours' }),
    [task({ goal_id: 'g1', estimated_minutes: 30 })], [], entries), { current: 3, total: 5, pct: 60 })
})

test('units modu görevleri saymaz; kesirli elle kayıtları toplar ve yüzdeyi sınırlar', () => {
  const g = goal({ target: 2.5, count_mode: 'units' })
  assert.deepEqual(computeGoalProgress(g, [task({ goal_id: 'g1' })], [], [entry()]),
    { current: 1.25, total: 2.5, pct: 50 })
  assert.equal(computeGoalProgress(g, [], [], [entry({ amount: 8 })]).pct, 100)
  assert.equal(computeGoalProgress(g, [task({ goal_id: 'g1' })]).current, 0)
})

test('elle ilerleme üst hedeflere akar; yalnız dolu ve aktif hedefler otomatik kapanır', () => {
  const child = goal({ count_mode: 'units', target: 1, parent_id: 'm' })
  const parent = goal({ id: 'm', horizon: 'month', target: null, count_mode: null })
  const empty = goal({ id: 'empty', target: null, count_mode: null })
  const done = goal({ id: 'done', status: 'done' })
  const dropped = goal({ id: 'dropped', status: 'dropped' })
  const goals = [child, parent, empty, done, dropped]
  const progress = goalTreeProgress(goals, [], [entry()])
  progress.set('empty', { current: 0, total: 0, pct: 100 })
  progress.set('dropped', { current: 3, total: 3, pct: 100 })
  assert.deepEqual(goalsToAutoComplete(goals, progress), ['g1', 'm'])
})
