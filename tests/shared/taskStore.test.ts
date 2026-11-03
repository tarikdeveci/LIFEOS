import { test } from 'node:test'
import assert from 'node:assert/strict'

import { useTaskStore } from '../../packages/shared/src/stores/taskStore.ts'
import type { Task } from '../../packages/shared/src/types/task.ts'

type AddTaskClient = Parameters<ReturnType<typeof useTaskStore.getState>['addTask']>[0]

const task = (id: string): Task => ({ id, title: id }) as unknown as Task

/** Görev satırını döndüren sahte istemci; `realtimeFirst` açıkken yanıttan önce Realtime INSERT olayını teslim eder. */
function taskClient(row: Task, realtimeFirst: boolean) {
  const detailResult = { data: null, error: null }
  const client = {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => {
            if (realtimeFirst) {
              useTaskStore.getState().handleRealtimeEvent({ eventType: 'INSERT', new: row, old: null })
            }
            return { data: row, error: null }
          },
        }),
        then: (resolve: (value: typeof detailResult) => void) => resolve(detailResult),
      }),
    }),
  }
  return client as unknown as AddTaskClient
}

test('addTask: Realtime INSERT yanıttan önce gelirse görev listede bir kez durur', async () => {
  useTaskStore.setState({ tasks: [task('t0')] })

  const created = await useTaskStore.getState().addTask(taskClient(task('t1'), true), 'u', { title: 't1' })

  assert.equal(created.id, 't1')
  assert.deepEqual(useTaskStore.getState().tasks.map((t) => t.id), ['t1', 't0'])
})

test('addTask: Realtime olayı gelmediyse yeni görev listenin başına eklenir', async () => {
  useTaskStore.setState({ tasks: [task('t0')] })

  await useTaskStore.getState().addTask(taskClient(task('t1'), false), 'u', { title: 't1' })

  assert.deepEqual(useTaskStore.getState().tasks.map((t) => t.id), ['t1', 't0'])
})

type UpdateTaskClient = Parameters<ReturnType<typeof useTaskStore.getState>['updateTask']>[0]

/** update().eq().select().single() zincirini taklit eden sahte istemci. */
function updateClient(result: { data: Task | null; error: Error | null }) {
  const client = {
    from: () => ({
      update: () => ({
        eq: () => ({
          select: () => ({
            single: async () => result,
          }),
        }),
      }),
    }),
  }
  return client as unknown as UpdateTaskClient
}

test('updateTask: sunucunun hesapladığı priority_score store\'a yazılır, task_details korunur', async () => {
  const before = { id: 't1', title: 't1', value_score: 3, priority_score: 1.5, task_details: { notes: 'n' } } as unknown as Task
  useTaskStore.setState({ tasks: [before], selectedTask: before })
  const server = { id: 't1', title: 't1', value_score: 5, priority_score: 1.83 } as unknown as Task

  const updated = await useTaskStore.getState().updateTask(updateClient({ data: server, error: null }), 't1', { value_score: 5 })

  assert.equal(updated.priority_score, 1.83)
  const state = useTaskStore.getState()
  assert.equal(state.tasks[0]?.priority_score, 1.83)
  assert.equal(state.selectedTask?.priority_score, 1.83)
  assert.deepEqual(state.selectedTask?.task_details, { notes: 'n' })
})

test('updateTask: sunucu hata verirse eski değerler geri gelir ve hata fırlatılır', async () => {
  const before = { id: 't1', title: 't1', value_score: 3, priority_score: 1.5 } as unknown as Task
  useTaskStore.setState({ tasks: [before], selectedTask: before })

  await assert.rejects(
    useTaskStore.getState().updateTask(updateClient({ data: null, error: new Error('ağ') }), 't1', { value_score: 5 }),
  )

  const state = useTaskStore.getState()
  assert.equal(state.tasks[0]?.value_score, 3)
  assert.equal(state.selectedTask?.value_score, 3)
})
