import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { useRoutineStore } from '../../packages/shared/src/stores/routineStore.ts'

// Alışkanlık sayacı yazmaları: her upsert/delete sırayla kaydedilir, sonucu testin verdiği
// söz (promise) belirler; böylece sunucu yanıt sırası elle kurulabilir.
interface Write { count: number | null; resolve: () => void; reject: (e: Error) => void }

function fakeSupabase() {
  const writes: Write[] = []
  const query = (count: number | null) => {
    const chain = {
      eq: () => chain,
      then: (ok: (r: unknown) => unknown, fail: (e: unknown) => unknown) =>
        new Promise<{ error: null | { message: string } }>((resolve) => {
          writes.push({ count, resolve: () => resolve({ error: null }), reject: (e) => resolve({ error: { message: e.message } }) })
        }).then(ok, fail),
    }
    return chain
  }
  const client = {
    from: () => ({
      upsert: (row: { count: number }) => query(row.count),
      delete: () => query(null),
    }),
  }
  return { client: client as unknown as SupabaseClient, writes }
}

const tick = () => new Promise((r) => setTimeout(r, 0))
const countOf = (routineId: string) =>
  useRoutineStore.getState().completions.find((c) => c.routine_id === routineId && c.completed_on === '2026-10-01')?.count ?? 0

beforeEach(() => useRoutineStore.setState({ completions: [] }))

test('aynı alışkanlık/gün yazmaları sırayla gider: ikinci yazma ilki bitmeden gönderilmez', async () => {
  const { client, writes } = fakeSupabase()
  const store = useRoutineStore.getState()
  const first = store.setHabitCount(client, 'u', 'r1', '2026-10-01', 1)
  const second = store.setHabitCount(client, 'u', 'r1', '2026-10-01', 2)
  await tick()
  assert.equal(writes.length, 1, 'ilk yanıt gelmeden ikinci yazma gönderilmemeli')
  writes[0]!.resolve()
  await first
  await tick()
  assert.equal(writes.length, 2)
  assert.equal(writes[1]!.count, 2)
  writes[1]!.resolve()
  await second
  assert.equal(countOf('r1'), 2)
})

test('başarısız yazma yalnız kendi alışkanlığını geri alır, diğerinin başarılı işareti kalır', async () => {
  const { client, writes } = fakeSupabase()
  const store = useRoutineStore.getState()
  const a = store.setHabitCount(client, 'u', 'rA', '2026-10-01', 1)
  const b = store.setHabitCount(client, 'u', 'rB', '2026-10-01', 1)
  await tick()
  writes[1]!.resolve()
  await b
  writes[0]!.reject(new Error('ağ'))
  await assert.rejects(a)
  assert.equal(countOf('rA'), 0)
  assert.equal(countOf('rB'), 1)
})

test('eski yazma başarısız olsa da sonradan girilen değer ekranda kalır', async () => {
  const { client, writes } = fakeSupabase()
  const store = useRoutineStore.getState()
  const first = store.setHabitCount(client, 'u', 'r1', '2026-10-01', 1)
  const second = store.setHabitCount(client, 'u', 'r1', '2026-10-01', 2)
  await tick()
  writes[0]!.reject(new Error('ağ'))
  await assert.rejects(first)
  assert.equal(countOf('r1'), 2, 'daha yeni değer geri alınmamalı')
  await tick()
  writes[1]!.resolve()
  await second
  assert.equal(countOf('r1'), 2)
})

test('şablon yazılıp örnek üretimi başarısız olursa ekran yeni şablonda kalır', async () => {
  const old = { id: 'r1', title: 'Eski', kind: 'block', start_time: '09:00', created_at: '' }
  useRoutineStore.setState({ routines: [old] as never })
  const client = {
    from: () => ({
      update: (patch: Record<string, unknown>) => ({
        eq: () => ({ select: () => ({ single: async () => ({ data: { ...old, ...patch }, error: null }) }) }),
      }),
    }),
    rpc: async () => ({ data: null, error: { message: 'ağ' } }),
  } as unknown as SupabaseClient
  await assert.rejects(useRoutineStore.getState().updateSeries(client, 'r1', { title: 'Yeni' }))
  assert.equal(useRoutineStore.getState().routines[0]?.title, 'Yeni')
})
