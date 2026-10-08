import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { useGoalStore } from '../../packages/shared/src/stores/goalStore.ts'
import { useTaskStore } from '../../packages/shared/src/stores/taskStore.ts'
import type { Goal, GoalEntry } from '../../packages/shared/src/types/goal.ts'
import type { Task } from '../../packages/shared/src/types/task.ts'

const goal = (patch: Partial<Goal> = {}): Goal => ({
  id: 'g', user_id: 'u', parent_id: null, horizon: 'week', title: 'Koş', icon: null,
  period_start: '2026-10-05', target: 2, unit: 'km', count_mode: 'units', tag_filter: [],
  daily_cap: null, status: 'active', review_note: null, reviewed_at: null,
  created_at: '', updated_at: '', ...patch,
})
const entry = (patch: Partial<GoalEntry> = {}): GoalEntry => ({
  id: 'e', goal_id: 'g', user_id: 'u', amount: 2, entry_date: '2026-10-08',
  note: null, created_at: '', ...patch,
})
const task = (patch: Partial<Task> = {}): Task => ({
  id: 't', user_id: 'u', title: 'Koş', goal_id: 'g', tags: [], status: 'planned',
  scheduled_date: '2026-10-08', completed_at: null, estimated_minutes: 60, ...patch,
} as Task)

// Yazmalar bekletilebilir; başarısız yanıtlar ve yanıt sırası sınanır.
function fakeDb(goals = [goal()], entries: GoalEntry[] = [], tasks: Task[] = []) {
  const db = { goals: [...goals], entries: [...entries], tasks: [...tasks] }
  const writes: { table: string; patch: Record<string, unknown> }[] = []
  const control = { failInsert: false, failDelete: false, failStatus: false, failTask: false,
    insertWait: null as Promise<void> | null, statusWait: null as Promise<void> | null }
  let sequence = 0
  const client = {
    from: (table: string) => ({
      select: () => {
        const chain = {
          eq: () => chain, gte: () => chain, lte: () => chain, or: () => chain, order: () => chain, not: () => chain,
          then: (resolve: (value: unknown) => void) => resolve({
            data: table === 'goals' ? [...db.goals] : table === 'goal_entries' ? [...db.entries]
              : table === 'routines' ? [] : [...db.tasks],
            error: null,
          }),
        }
        return chain
      },
      insert: (input: Omit<GoalEntry, 'id' | 'created_at' | 'note'>) => ({
        select: () => ({ single: async () => {
          await control.insertWait
          if (control.failInsert) return { data: null, error: new Error('insert') }
          const row = entry({ ...input, id: `e${++sequence}` })
          db.entries.push(row)
          return { data: row, error: null }
        } }),
      }),
      delete: () => ({ eq: async (_column: string, id: string) => {
        if (control.failDelete) return { error: new Error('delete') }
        db.entries = db.entries.filter((e) => e.id !== id)
        return { error: null }
      } }),
      update: (patch: Record<string, unknown>) => ({ eq: (_column: string, id: string) => ({
        select: () => ({ single: async () => {
          if (table === 'goals') await control.statusWait
          if ((table === 'goals' && control.failStatus) || (table === 'tasks' && control.failTask)) {
            return { data: null, error: new Error('update') }
          }
          writes.push({ table, patch })
          if (table === 'goals') {
            db.goals = db.goals.map((g) => g.id === id ? { ...g, ...patch } : g)
            return { data: db.goals.find((g) => g.id === id), error: null }
          }
          db.tasks = db.tasks.map((t) => t.id === id ? { ...t, ...patch } : t)
          return { data: db.tasks.find((t) => t.id === id), error: null }
        } }),
      }) }),
    }),
  } as unknown as SupabaseClient
  return { client, db, writes, control }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
beforeEach(() => {
  useGoalStore.getState().reset()
  useTaskStore.setState({ tasks: [] })
})

test('yükleme kayıtları getirir ve dolan hedefi kalıcı tamamlar', async () => {
  const { client, db } = fakeDb([goal()], [entry()])
  await useGoalStore.getState().fetchGoals(client, 'u', '2026-10-08')
  assert.deepEqual(useGoalStore.getState().entries, [entry()])
  assert.equal(useGoalStore.getState().goals[0]?.status, 'done')
  assert.equal(db.goals[0]?.status, 'done')
})

test('kayıt iyimser eklenir, sunucu kimliğiyle değişir; silince hedef yeniden açılır', async () => {
  const { client, db, control } = fakeDb()
  useGoalStore.setState({ goals: [goal()] })
  let release = () => {}
  control.insertWait = new Promise<void>((resolve) => { release = resolve })
  const save = useGoalStore.getState().logProgress(client, 'u', 'g', 2.5, '2026-10-08')
  assert.equal(useGoalStore.getState().entries[0]?.amount, 2.5)
  assert.match(useGoalStore.getState().entries[0]!.id, /^pending-/)
  release()
  await save
  assert.equal(useGoalStore.getState().entries[0]?.id, 'e1')
  assert.equal(db.goals[0]?.status, 'done')
  await useGoalStore.getState().removeEntry(client, 'e1')
  assert.deepEqual(useGoalStore.getState().entries, [])
  assert.equal(db.goals[0]?.status, 'active')
})

test('başarısız ekleme yalnız kendi iyimser kaydını siler; silme hatası kaydı geri koyar', async () => {
  const { client, control } = fakeDb()
  useGoalStore.setState({ goals: [goal()], entries: [entry({ id: 'old', amount: 0.5 })] })
  control.failInsert = true
  await assert.rejects(useGoalStore.getState().logProgress(client, 'u', 'g', 2, '2026-10-08'))
  assert.deepEqual(useGoalStore.getState().entries.map((e) => e.id), ['old'])
  assert.equal(useGoalStore.getState().goals[0]?.status, 'active')
  control.failDelete = true
  await assert.rejects(useGoalStore.getState().removeEntry(client, 'old'))
  assert.deepEqual(useGoalStore.getState().entries.map((e) => e.id), ['old'])
})

test('geçersiz miktar yazılmaz; sıfır, negatif, sonsuz ve üst sınır reddedilir', async () => {
  const { client } = fakeDb()
  useGoalStore.setState({ goals: [goal()] })
  for (const amount of [0, -1, NaN, Infinity, 100001]) {
    await assert.rejects(useGoalStore.getState().logProgress(client, 'u', 'g', amount))
  }
  assert.deepEqual(useGoalStore.getState().entries, [])
})

test('taskStore tamamlaması, geri açma ve etiketle eşleşen eksik görev anında yansır', async () => {
  const g = goal({ count_mode: 'tasks', target: 1, tag_filter: ['spor'] })
  const { client, db } = fakeDb([g], [], [task()])
  await useGoalStore.getState().fetchGoals(client, 'u', '2026-10-08')
  useTaskStore.setState({ tasks: [task()] })
  useTaskStore.setState({ tasks: [task({ status: 'done' })] })
  assert.equal(useGoalStore.getState().tasks[0]?.status, 'done')
  await tick()
  assert.equal(db.goals[0]?.status, 'done')
  useTaskStore.setState({ tasks: [task()] })
  await tick()
  assert.equal(db.goals[0]?.status, 'active')
  useTaskStore.setState({ tasks: [task({ id: 'tag', goal_id: null, tags: ['spor'], status: 'done' })] })
  await tick()
  assert.equal(useGoalStore.getState().tasks.find((t) => t.id === 'tag')?.status, 'done')
  assert.equal(db.goals[0]?.status, 'done')
  useTaskStore.setState({ tasks: [task({ id: 'foreign', user_id: 'other', status: 'done' })] })
  assert.equal(useGoalStore.getState().tasks.some((t) => t.id === 'foreign'), false)
})

test('adım tamamlama ve geri açma sayılabilir hedef durumunu değiştirir', async () => {
  const { client, db } = fakeDb([goal({ count_mode: 'tasks', target: 1 })], [], [task()])
  await useGoalStore.getState().fetchGoals(client, 'u', '2026-10-08')
  useTaskStore.setState({ tasks: [task()] })
  await useGoalStore.getState().setStepDone(client, 't', true)
  assert.equal(db.goals[0]?.status, 'done')
  await useGoalStore.getState().setStepDone(client, 't', false)
  assert.equal(db.goals[0]?.status, 'active')
})

test('durum yazımı başarısızsa başarılı kayıt korunur ve hata görünür', async () => {
  const { client, db, control } = fakeDb()
  useGoalStore.setState({ goals: [goal()] })
  control.failStatus = true
  await useGoalStore.getState().logProgress(client, 'u', 'g', 2, '2026-10-08')
  assert.equal(db.entries.length, 1)
  assert.equal(useGoalStore.getState().entries.length, 1)
  assert.equal(useGoalStore.getState().goals[0]?.status, 'active')
  assert.ok(useGoalStore.getState().error)
})

test('çıkıştan sonra geciken kayıt yeni hesabın durumuna yazılmaz', async () => {
  const { client, control } = fakeDb()
  useGoalStore.setState({ goals: [goal()] })
  let release = () => {}
  control.insertWait = new Promise<void>((resolve) => { release = resolve })
  const save = useGoalStore.getState().logProgress(client, 'u', 'g', 2, '2026-10-08')
  useGoalStore.getState().reset()
  release()
  await save
  assert.deepEqual(useGoalStore.getState().entries, [])
  assert.deepEqual(useGoalStore.getState().goals, [])
})

test('geciken tamamlama sonrası geri açma sunucuya son durum olarak yazılır', async () => {
  const { client, db, control } = fakeDb([goal({ count_mode: 'tasks', target: 1 })], [], [task()])
  await useGoalStore.getState().fetchGoals(client, 'u', '2026-10-08')
  let release = () => {}
  control.statusWait = new Promise<void>((resolve) => { release = resolve })
  useTaskStore.setState({ tasks: [task({ status: 'done' })] })
  await tick()
  useTaskStore.setState({ tasks: [task()] })
  release()
  await tick()
  assert.equal(db.goals[0]?.status, 'active')
  assert.equal(useGoalStore.getState().goals[0]?.status, 'active')
})

test('elle kapatılmış eksik hedef, ilgisiz görev değişince yeniden açılmaz', async () => {
  const manual = goal({ id: 'manual', status: 'done', target: 10 })
  const run = goal({ count_mode: 'tasks', target: 1 })
  const { client, db } = fakeDb([manual, run], [], [task()])
  await useGoalStore.getState().fetchGoals(client, 'u', '2026-10-08')
  useTaskStore.setState({ tasks: [task()] })
  useTaskStore.setState({ tasks: [task({ status: 'done' })] })
  await tick()
  useTaskStore.setState({ tasks: [task()] })
  await tick()
  assert.equal(db.goals.find((g) => g.id === 'g')?.status, 'active')
  assert.equal(db.goals.find((g) => g.id === 'manual')?.status, 'done')
  assert.equal(useGoalStore.getState().goals.find((g) => g.id === 'manual')?.status, 'done')
})
