import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

import { persistFocus, useFocusStore } from '../../packages/shared/src/stores/focusStore.ts'

type FocusClient = Parameters<ReturnType<typeof useFocusStore.getState>['save']>[0]

const block = { id: 'b1', task_id: null, block_type: 'focus', label: 'Odak' }
const start = Date.parse('2026-10-01T09:00:00+03:00')

/** insert yanıtı testin elinde: kayıt, sıfırlama sonrasına kadar bekletilebilir. */
function slowClient() {
  let release: (() => void) | null = null
  const client = {
    from: () => ({
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: () => new Promise((resolve) => {
            release = () => resolve({ data: { ...row, created_at: '' }, error: null })
          }),
        }),
      }),
    }),
  }
  return { client: client as unknown as FocusClient, release: () => release?.() }
}

class MemoryStorage {
  data = new Map<string, string>()
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
  removeItem(key: string) { this.data.delete(key) }
}

beforeEach(() => useFocusStore.getState().reset())

test('sıfırlamadan önce başlayan kaydın geç yanıtı yeni hesabın bekleyen kaydını silmez', async () => {
  const store = useFocusStore.getState()
  store.start('s-a', 'user-a', block, start)
  store.finish(start + 10 * 60_000)
  const { client, release } = slowClient()
  const saving = useFocusStore.getState().save(client)

  useFocusStore.getState().reset()
  useFocusStore.getState().start('s-b', 'user-b', block, start)
  useFocusStore.getState().finish(start + 5 * 60_000)
  assert.equal(useFocusStore.getState().pending?.input.id, 's-b')

  release()
  await saving
  assert.equal(useFocusStore.getState().pending?.input.id, 's-b', "B'nin bekleyen kaydı kalmalı")
})

test('süren odak depoya yazılır ve aynı kullanıcı için geri yüklenir', async () => {
  const storage = new MemoryStorage()
  const stop = await persistFocus(storage, 'user-a')
  useFocusStore.getState().start('s-a', 'user-a', block, start)
  stop()
  assert.ok(storage.data.size === 1, 'aktif odak depoya yazılmalı')

  // Uygulama kapandı: bellek boş, depo dolu.
  useFocusStore.setState({ active: null, pending: null })
  const stopAgain = await persistFocus(storage, 'user-a')
  assert.equal(useFocusStore.getState().active?.id, 's-a')
  assert.equal(useFocusStore.getState().active?.timer.phaseStartedAt, start)
  stopAgain()
})

test('başka kullanıcının kaydı geri yüklenmez ve depodan silinir', async () => {
  const storage = new MemoryStorage()
  const stop = await persistFocus(storage, 'user-a')
  useFocusStore.getState().start('s-a', 'user-a', block, start)
  stop()
  useFocusStore.setState({ active: null, pending: null })

  const stopB = await persistFocus(storage, 'user-b')
  assert.equal(useFocusStore.getState().active, null)
  assert.equal(storage.data.size, 0)
  stopB()
})

test('bozuk depo kaydı açılışı bozmaz', async () => {
  const storage = new MemoryStorage()
  storage.data.set('lifeos.focus.v1', '{bozuk')
  const stop = await persistFocus(storage, 'user-a')
  assert.equal(useFocusStore.getState().active, null)
  stop()
})
