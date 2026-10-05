import { test } from 'node:test'
import assert from 'node:assert/strict'

import { CHECKIN_MAX_ITEMS, CHECKIN_NOTE_MAX, parseCheckin, pruneCheckin } from '../../supabase/functions/_shared/report/checkin.ts'
import { refreshFrozenItems } from '../../supabase/functions/_shared/report/store.ts'
import type { DayItem } from '../../supabase/functions/_shared/report/types.ts'

const item = (key: string, over: Partial<DayItem> = {}): DayItem => ({
  key,
  kind: 'task',
  title: key,
  area: null,
  minutes: 30,
  start_time: '09:00',
  expected: true,
  outcome: 'open',
  reason: null,
  program: { done: 7, target: 42 },
  ...over,
})

const ID = '3f2b8c1e-0a4d-4c52-9f6e-1d2a3b4c5d6e'

test('parseCheckin: geçerli gövde temizlenip döner', () => {
  const out = parseCheckin({
    items: { [`task:${ID}`]: { outcome: 'skipped', reason: 'energy' }, [`habit:${ID}`]: { outcome: 'partial', reason: null } },
    note: '  Yorgundum.  ',
    closed_at: '2026-10-07T20:05:00+03:00',
    fazlalik: 'yok sayılır',
  })
  assert.deepEqual(out, {
    items: { [`task:${ID}`]: { outcome: 'skipped', reason: 'energy' }, [`habit:${ID}`]: { outcome: 'partial' } },
    note: 'Yorgundum.',
    closed_at: '2026-10-07T17:05:00.000Z',
  })
  assert.deepEqual(parseCheckin({}), {})
  assert.deepEqual(parseCheckin({ note: '   ' }), {})
})

test('parseCheckin: "done" işareti, bilinmeyen sebep, kötü anahtar ve bozuk biçim reddedilir', () => {
  assert.equal(parseCheckin(null), null)
  assert.equal(parseCheckin([]), null)
  assert.equal(parseCheckin('x'), null)
  assert.equal(parseCheckin({ items: { [`task:${ID}`]: { outcome: 'done' } } }), null)
  assert.equal(parseCheckin({ items: { [`task:${ID}`]: { outcome: 'skipped', reason: 'tembellik' } } }), null)
  assert.equal(parseCheckin({ items: { 'proje:1': { outcome: 'skipped' } } }), null)
  assert.equal(parseCheckin({ items: { [`task:${ID}`]: 'skipped' } }), null)
  assert.equal(parseCheckin({ items: [] }), null)
  assert.equal(parseCheckin({ note: 5 }), null)
  assert.equal(parseCheckin({ closed_at: 'dün akşam' }), null)
})

test('parseCheckin: sınırlar (not uzunluğu, öğe sayısı)', () => {
  assert.notEqual(parseCheckin({ note: 'a'.repeat(CHECKIN_NOTE_MAX) }), null)
  assert.equal(parseCheckin({ note: 'a'.repeat(CHECKIN_NOTE_MAX + 1) }), null)
  const items = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`task:t${i}`, { outcome: 'skipped' }]))
  assert.notEqual(parseCheckin({ items: items(CHECKIN_MAX_ITEMS) }), null)
  assert.equal(parseCheckin({ items: items(CHECKIN_MAX_ITEMS + 1) }), null)
})

test('pruneCheckin: günde olmayan öğenin işareti atılır, geri kalanı korunur', () => {
  const checkin = {
    items: { 'task:a': { outcome: 'skipped' as const }, 'task:gitti': { outcome: 'partial' as const } },
    note: 'not',
  }
  assert.deepEqual(pruneCheckin(checkin, [item('task:a')]), { items: { 'task:a': { outcome: 'skipped' } }, note: 'not' })
  assert.deepEqual(pruneCheckin(checkin, []), { note: 'not' })
  assert.equal(pruneCheckin({ note: 'x' }, []).note, 'x')
})

test('geçmiş gün tazeleme: sonradan yapıldı işaretlenen öğe done olur, liste ve program donuk kalır', () => {
  const frozen = [item('task:a'), item('block:b'), item('habit:h', { program: null }), item('task:silindi')]
  const out = refreshFrozenItems(frozen, new Map([['task:a', true], ['block:b', false], ['habit:h', true]]))
  assert.deepEqual(out.map((i) => [i.key, i.outcome]), [
    ['task:a', 'done'],
    ['block:b', 'open'],
    ['habit:h', 'done'],
    ['task:silindi', 'open'],
  ])
  assert.deepEqual(out[0]?.program, { done: 7, target: 42 })
  assert.equal(out.length, frozen.length)
  assert.equal(frozen[0]?.outcome, 'open')
})

test('geçmiş gün tazeleme: yanlışlıkla işaretlenip geri alınan öğe tekrar open olur', () => {
  const out = refreshFrozenItems([item('task:a', { outcome: 'done' })], new Map([['task:a', false]]))
  assert.equal(out[0]?.outcome, 'open')
})

test('geçmiş gün tazeleme: bulunamayan (silinmiş) öğenin sonucu olduğu gibi kalır', () => {
  const frozen = [item('task:a', { outcome: 'done' })]
  const out = refreshFrozenItems(frozen, new Map())
  assert.equal(out[0], frozen[0])
})
