import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { usePlanningStore } from '../../packages/shared/src/stores/planningStore.ts'
import { useRoutineStore } from '../../packages/shared/src/stores/routineStore.ts'
import { useTaskStore } from '../../packages/shared/src/stores/taskStore.ts'
import type { Routine } from '../../packages/shared/src/types/routine.ts'
import type { TimeBlock } from '../../packages/shared/src/types/planning.ts'
import type { Task } from '../../packages/shared/src/types/task.ts'

const block = (id: string, start: string, end: string, taskId?: string) =>
  ({ id, start_time: start, end_time: end, date: '2026-10-01', label: id, block_type: 'task', task_id: taskId, completed_at: null }) as unknown as TimeBlock

const task = (id: string, status: string = 'planned') =>
  ({ id, status, completed_at: null }) as unknown as Task

/** time_blocks güncellemeleri: failId'ye giden ilk yazma hata verir, diğerleri veritabanına işlenir. */
function fakeDb(rows: Record<string, { start_time: string; end_time: string }>, failId: string) {
  const client = {
    from: () => ({
      update: (patch: { start_time: string; end_time: string }) => ({
        eq: (_col: string, id: string) => ({
          select: () => ({
            single: async () => {
              if (id === failId) return { data: null, error: { message: 'ağ' } }
              rows[id] = { ...rows[id]!, ...patch }
              return { data: { id, ...rows[id] }, error: null }
            },
          }),
        }),
      }),
    }),
  }
  return client as unknown as SupabaseClient
}

test('kaydırmanın bir parçası başarısız olursa başarılı parçalar da eski saatine döner', async () => {
  const db = { a: { start_time: '09:00', end_time: '10:00' }, b: { start_time: '10:00', end_time: '11:00' } }
  usePlanningStore.setState({ timeBlocks: [block('a', '09:00', '10:00'), block('b', '10:00', '11:00')] })
  await assert.rejects(usePlanningStore.getState().applyShift(fakeDb(db, 'b'), [
    { id: 'a', start_time: '09:30', end_time: '10:30' },
    { id: 'b', start_time: '10:30', end_time: '11:30' },
  ]))
  assert.deepEqual(db.a, { start_time: '09:00', end_time: '10:00' }, 'veritabanında A geri alınmalı')
  assert.deepEqual(usePlanningStore.getState().timeBlocks.map((b) => b.start_time), ['09:00', '10:00'])
})

test('taskStore güncellendiğinde bağlı timeBlock completed_at senkronize olur', () => {
  usePlanningStore.setState({ timeBlocks: [block('b1', '09:00', '10:00', 't1')] })
  useTaskStore.setState({ tasks: [task('t1', 'planned')] })

  // Görevi tamamlandı yap
  useTaskStore.setState({ tasks: [{ ...task('t1', 'done'), completed_at: '2026-10-08T10:00Z' }] })

  const blocksAfterDone = usePlanningStore.getState().timeBlocks
  assert.equal(blocksAfterDone[0]?.completed_at, '2026-10-08T10:00Z', 'görev bitince blok da tamamlandı işaretlenmeli')

  // Görevi geri al
  useTaskStore.setState({ tasks: [task('t1', 'planned')] })

  const blocksAfterUndo = usePlanningStore.getState().timeBlocks
  assert.equal(blocksAfterUndo[0]?.completed_at, null, 'görev geri alınınca bloğun completed_at temizlenmeli')
})

test('durumu değişmeyen eski görev kopyası başka cihazda tamamlanmış bloğu geri açmaz', () => {
  usePlanningStore.setState({ timeBlocks: [{ ...block('b1', '09:00', '10:00', 't1'), completed_at: '2026-10-08T09:30Z' }] })
  useTaskStore.setState({ tasks: [task('t1', 'planned'), task('t2', 'planned')] })

  // Yalnızca t2 değişti; t1'in bayat 'planned' hâli bloğa yansımamalı.
  useTaskStore.setState({ tasks: [task('t1', 'planned'), task('t2', 'done')] })

  assert.equal(usePlanningStore.getState().timeBlocks[0]?.completed_at, '2026-10-08T09:30Z')
})

/** Yazılan tabloları ve çağrılan RPC'leri kaydeder; her yazma başarılı. */
function recordingDb(log: string[]) {
  const client = {
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => ({
        eq: (_col: string, id: string) => ({
          select: () => ({
            single: async () => {
              log.push(`update:${table}`)
              return { data: { id, ...patch }, error: null }
            },
          }),
        }),
      }),
    }),
    rpc: async (name: string) => {
      log.push(`rpc:${name}`)
      return { data: [{ routine_id: 'r1', done_count: 8 }], error: null }
    },
  }
  return client as unknown as SupabaseClient
}

test('blok tamamlanınca görev sunucuya ikinci kez yazılmaz, yerelde kapanır, program sayacı tazelenir', async () => {
  const log: string[] = []
  usePlanningStore.setState({ timeBlocks: [{ ...block('b1', '09:00', '10:00', 't1'), routine_id: 'r1' }] })
  useTaskStore.setState({ tasks: [task('t1', 'planned')] })
  useRoutineStore.setState({ routines: [{ id: 'r1', target_count: 42 } as unknown as Routine], progress: { r1: 7 } })

  await usePlanningStore.getState().setBlockDone(recordingDb(log), 'b1', true)
  await new Promise((resolve) => setImmediate(resolve))

  // 067 tetikleyicisi görevi sunucuda kapatır; istemci yalnızca bloğu yazar.
  assert.deepEqual(log, ['update:time_blocks', 'rpc:my_routine_progress'])
  assert.equal(useTaskStore.getState().tasks[0]?.status, 'done')
  assert.notEqual(usePlanningStore.getState().timeBlocks[0]?.completed_at, null)
  assert.equal(useRoutineStore.getState().progress.r1, 8)
})
