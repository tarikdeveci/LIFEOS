import { test } from 'node:test'
import assert from 'node:assert/strict'

import { sanitizeLifeSetup } from '../../packages/shared/src/utils/lifeSetup.ts'
import { parseLifeSetup } from '../../supabase/functions/_shared/ai/lifeSetup.ts'

// Sunucu (parseLifeSetup, metin) ve istemci (sanitizeLifeSetup, nesne) iki ayrı kopya.
// Aynı girdi aynı öneriye inmeli; biri değişip öteki unutulursa bu test kırılır.
// parseLifeSetup içeriksiz öneride null döner, sanitize boş öneri: ikisi eşdeğer sayılır.

const EMPTY = { summary: '', routines: [], goals: [], tasks: [], rules: {}, unsupported: [] }

const CASES: Record<string, unknown> = {
  boş: {},
  'yalnızca özet': { summary: '  Kurulacak bir şey yok.  ' },
  'tam plan': {
    summary: 'Plan',
    routines: [
      { title: 'Audit', kind: 'block', area: 'career', block_type: 'focus', days_of_week: [1, 2, 3], start_time: '09:00', end_time: '10:30', is_protected: true, min_minutes: 20 },
      { title: 'Su', kind: 'habit', times_per_week: 3, times_per_day: 2, is_untracked: true },
      { title: 'Kur\'an', kind: 'habit', area: 'spiritual', target_count: 42, start_count: 7 },
    ],
    goals: [{ title: 'Claude', horizon: 'month', daily_cap: 1, steps: ['Adım 1', 'Adım 2'], count_mode: 'tasks', target_count: 10 }],
    tasks: [{ title: 'Rapor', area: 'career' }, { title: 'Alışveriş' }],
    rules: { max_deep_tasks: 3, rollover: 'backlog', buffer_minutes: 15, about: 'Not.' },
    unsupported: ['Telefonsuz zaman'],
  },
  'geçersiz enum ve aralık': {
    routines: [{
      title: '  Okuma  ', kind: 'block', area: 'oyun', block_type: 'sinema',
      days_of_week: [1, 1, 9, -1, 'pzt', 3.5, 0], start_time: '7:05:30', end_time: '25:00',
      times_per_week: 8, times_per_day: 1, estimated_minutes: 0, min_minutes: 601,
      target_count: 1000, start_count: 5, is_protected: 'evet', is_untracked: 1, ekstra: 'x',
    }],
  },
  'tanınmayan tür ve başlıksız öğe': {
    routines: [{ title: 'Garip', kind: 'oyun' }, { kind: 'block' }, 'metin', null],
    goals: [{ title: 'Hedef', horizon: 'yıl' }, { horizon: 'week' }],
    tasks: [{ title: '' }, 5],
  },
  'liste tavanları': {
    routines: Array.from({ length: 25 }, (_, i) => ({ title: `Rutin ${i}`, kind: 'habit', times_per_week: 2 })),
    goals: Array.from({ length: 12 }, (_, i) => ({ title: `Hedef ${i}`, horizon: 'week' })),
    tasks: Array.from({ length: 35 }, (_, i) => ({ title: `Görev ${i}` })),
    unsupported: Array.from({ length: 14 }, (_, i) => `u${i}`),
  },
  'uzunluk kırpma': {
    summary: 'a'.repeat(900),
    goals: [{ title: 'G', horizon: 'month', steps: Array.from({ length: 20 }, (_, i) => `adım ${i} ${'b'.repeat(400)}`) }],
    tasks: [{ title: 't'.repeat(500) }],
    rules: { about: 'x'.repeat(3000) },
  },
  'kural sınırları': { rules: { max_deep_tasks: 99, rollover: 'sil', buffer_minutes: -5, about: 5 } },
  'sayısız hedef biçimi': {
    goals: [{ title: 'A', horizon: 'month', count_mode: 'hours', target_count: 0 }, { title: 'B', horizon: 'week', count_mode: 'hours', target_count: 12 }],
  },
  'özet olmayan içerik: yalnızca unsupported': { unsupported: ['x', '', 3] },
  'bozuk alan türleri': { summary: 5, routines: 'değil', goals: {}, tasks: 'x', rules: [], unsupported: 'x' },
}

for (const [name, raw] of Object.entries(CASES)) {
  test(`parite: ${name}`, () => {
    const server = parseLifeSetup(JSON.stringify(raw))
    const client = sanitizeLifeSetup(JSON.parse(JSON.stringify(raw)))
    assert.deepEqual(server ?? EMPTY, client)
  })
}

test('parite: model yanıtındaki kod çiti ve çevre metin sunucuda ayıklanır, sonuç aynı', () => {
  const raw = { summary: 'Plan', tasks: [{ title: 'Rapor' }] }
  const wrapped = `Tabii, işte plan:\n\`\`\`json\n${JSON.stringify(raw)}\n\`\`\``
  assert.deepEqual(parseLifeSetup(wrapped), sanitizeLifeSetup(raw))
})
