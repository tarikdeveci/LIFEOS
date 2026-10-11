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
