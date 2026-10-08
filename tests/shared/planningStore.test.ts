import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { applyBlockEvent, usePlanningStore } from '../../packages/shared/src/stores/planningStore.ts'
import { useRoutineStore } from '../../packages/shared/src/stores/routineStore.ts'
import { useTaskStore } from '../../packages/shared/src/stores/taskStore.ts'
import { todayDate } from '../../packages/shared/src/utils/date.ts'
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

test('applyBlockEvent: başka günün bloğu eklenmez, taşınan çıkar, bu güne gelen eklenir', () => {
  const day = '2026-10-08'
  const at = (id: string, date: string, start = '09:00:00') => ({ id, date, start_time: start, end_time: '10:00:00' }) as TimeBlock
  const list = [at('a', day)]
  assert.equal(applyBlockEvent(list, { eventType: 'INSERT', new: at('x', '2026-10-09'), old: null }, day), list)
  assert.deepEqual(applyBlockEvent(list, { eventType: 'INSERT', new: at('b', day, '08:00:00'), old: null }, day).map((b) => b.id), ['b', 'a'])
  assert.deepEqual(applyBlockEvent(list, { eventType: 'UPDATE', new: at('a', '2026-10-09'), old: null }, day), [])
  assert.deepEqual(applyBlockEvent([], { eventType: 'UPDATE', new: at('a', day), old: null }, day).map((b) => b.id), ['a'])
  assert.deepEqual(applyBlockEvent(list, { eventType: 'DELETE', new: null, old: { id: 'a' } }, day), [])
})

test('başka güne bakarken bugünün blokları korunur ve realtime ile güncellenir', () => {
  const today = todayDate()
  const at = (id: string, date: string) => ({ id, date, start_time: '09:00:00', end_time: '10:00:00' }) as TimeBlock
  usePlanningStore.setState({ date: today, timeBlocks: [at('t1', today)] })
  assert.deepEqual(usePlanningStore.getState().todayBlocks.map((b) => b.id), ['t1'])
  usePlanningStore.setState({ date: '2000-01-01', timeBlocks: [at('o1', '2000-01-01')] })
  assert.deepEqual(usePlanningStore.getState().todayBlocks.map((b) => b.id), ['t1'])
  usePlanningStore.getState().handleRealtimeEvent({ eventType: 'INSERT', new: at('t2', today), old: null })
  assert.deepEqual(usePlanningStore.getState().todayBlocks.map((b) => b.id), ['t1', 't2'])
  assert.deepEqual(usePlanningStore.getState().timeBlocks.map((b) => b.id), ['o1'])
})

test('başka güne bakarken görev kapanınca bugünün aynasındaki blok da kapanır', () => {
  const today = todayDate()
  const own = { ...block('b1', '09:00', '10:00', 't1'), date: today }
  usePlanningStore.setState({ date: today, timeBlocks: [own] })
  usePlanningStore.setState({ date: '2000-01-01', timeBlocks: [] })
  useTaskStore.setState({ tasks: [task('t1', 'planned')] })
  useTaskStore.setState({ tasks: [{ ...task('t1', 'done'), completed_at: '2026-10-08T10:00Z' }] })
  assert.equal(usePlanningStore.getState().todayBlocks[0]?.completed_at, '2026-10-08T10:00Z')
})
