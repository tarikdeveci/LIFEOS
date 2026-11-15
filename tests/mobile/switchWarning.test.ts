import { test } from 'node:test'
import assert from 'node:assert/strict'

import { collectGuestCounts, decideSwitchWarning, joinCountedParts } from '../../apps/mobile/src/auth/switchWarning.ts'
import { createLatestTargetQueue } from '../../apps/mobile/src/utils/identityQueue.ts'

test('hiç veri yoksa uyarı yok', () => {
  assert.deepEqual(decideSwitchWarning({ tasks: 0, meals: 0, blocks: 0, workouts: 0 }), { kind: 'none' })
})

test('veri varsa sayılı uyarı', () => {
  assert.deepEqual(decideSwitchWarning({ tasks: 3, meals: 2, blocks: 0, workouts: 0 }), { kind: 'counted', tasks: 3, meals: 2, blocks: 0, workouts: 0 })
})

test('sayım başarısızsa ve veri görünmüyorsa sayısız uyarı', () => {
  assert.deepEqual(decideSwitchWarning({ tasks: 0, meals: null, blocks: 0, workouts: 0 }), { kind: 'uncounted' })
  assert.deepEqual(decideSwitchWarning({ tasks: null, meals: null, blocks: null, workouts: null }), { kind: 'uncounted' })
})

test('kısmen sayılabilen veri varsa sayılı uyarı, bilinmeyenler sıfır yazılır', () => {
  assert.deepEqual(decideSwitchWarning({ tasks: 1, meals: null, blocks: 0, workouts: 0 }), { kind: 'counted', tasks: 1, meals: 0, blocks: 0, workouts: 0 })
})

test('sayılı metin sıfır olmayan parçaları birleştirir', () => {
  const label = (k: string, n: number) => `${n} ${k}`
  const w = (tasks: number, meals: number, blocks: number, workouts: number) => ({ kind: 'counted' as const, tasks, meals, blocks, workouts })
  assert.equal(joinCountedParts(w(3, 0, 0, 0), label, 've'), '3 tasks')
  assert.equal(joinCountedParts(w(3, 2, 0, 0), label, 've'), '3 tasks ve 2 meals')
  assert.equal(joinCountedParts(w(3, 2, 0, 1), label, 've'), '3 tasks, 2 meals ve 1 workouts')
  assert.equal(joinCountedParts(w(1, 1, 1, 1), label, 've'), '1 tasks, 1 meals, 1 blocks ve 1 workouts')
})

test('sayım hatası ve zaman aşımı null olur, diğerleri etkilenmez', async () => {
  const hang = () => new Promise<number>(() => {})
  const counts = await collectGuestCounts({ tasks: async () => 4, meals: hang, blocks: async () => { throw new Error('x') }, workouts: async () => 0 }, 30)
  assert.deepEqual(counts, { tasks: 4, meals: null, blocks: null, workouts: 0 })
})

test('kimlik kuyruğu sıralı çalışır, ara hedefi atlar ve hatada devam eder', async () => {
  const applied: (string | null)[] = []
  let release: () => void = () => {}
  const gate = new Promise<void>((r) => { release = r })
  const sync = createLatestTargetQueue<string | null>(async (target) => {
    if (applied.length === 0) await gate
    applied.push(target)
    if (target === 'boom') throw new Error('x')
  })
  const first = sync('A')
  sync('B')
  const last = sync(null)
  release()
  await Promise.all([first, last])
  assert.deepEqual(applied, [null, null, null])
  await sync('boom')
  await sync('C')
  assert.equal(applied[applied.length - 1], 'C')
})
