import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { usePlanningStore } from '../../packages/shared/src/stores/planningStore.ts'
import type { TimeBlock } from '../../packages/shared/src/types/planning.ts'

const block = (id: string, start: string, end: string) =>
  ({ id, start_time: start, end_time: end, date: '2026-10-01', label: id, block_type: 'task' }) as unknown as TimeBlock

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
