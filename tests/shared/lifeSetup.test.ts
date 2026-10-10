import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'

import { applyLifeSetup } from '../../packages/shared/src/supabase/lifeSetup.ts'
import { todayDate } from '../../packages/shared/src/utils/date.ts'
import { goalPeriodStart } from '../../packages/shared/src/utils/goals.ts'
import { sanitizeLifeSetup } from '../../packages/shared/src/utils/lifeSetup.ts'
import type { LifeSetupProposal } from '../../packages/shared/src/types/lifeSetup.ts'

type Rec = Record<string, unknown>

const EMPTY: LifeSetupProposal = { summary: '', routines: [], goals: [], tasks: [], rules: {}, unsupported: [] }

const block = (over: Rec = {}): Rec => ({
  title: 'Audit', kind: 'block', days_of_week: [1, 2, 3], start_time: '09:00', end_time: '10:00', ...over,
})
const habit = (over: Rec = {}): Rec => ({ title: 'Su', kind: 'habit', times_per_week: 3, ...over })

/** Tek rutin yollar, temizlenmiş ilk rutini ya da null döner. */
const routineOf = (raw: Rec) => sanitizeLifeSetup({ routines: [raw] }).routines[0] ?? null
const goalOf = (raw: Rec) => sanitizeLifeSetup({ goals: [{ title: 'Hedef', horizon: 'week', ...raw }] }).goals[0] ?? null

test('saçma girdide çökmez, boş öneri döner', () => {
  for (const junk of [null, undefined, 42, 'metin', true, [], {}, { routines: 'x', goals: 5, tasks: {}, rules: [] }]) {
    assert.deepEqual(sanitizeLifeSetup(junk), EMPTY, String(junk))
  }
})

test('liste öğeleri nesne değilse atlanır', () => {
  const out = sanitizeLifeSetup({ routines: [null, 'x', 3, [], block()], tasks: ['görev', null], goals: [undefined] })
  assert.equal(out.routines.length, 1)
  assert.deepEqual(out.tasks, [])
  assert.deepEqual(out.goals, [])
  assert.deepEqual(out.unsupported, [])
})

test('geçerli öneri değişmeden geçer', () => {
  const proposal: LifeSetupProposal = {
    summary: 'Audit eğitimi ve iş başvurusu odaklı bir hafta.',
    routines: [
      {
        title: 'Audit eğitimi', kind: 'block', area: 'career', block_type: 'focus', days_of_week: [1, 2, 3, 4, 5],
        start_time: '09:00', end_time: '10:00', estimated_minutes: 60, min_minutes: 45,
        target_count: 42, start_count: 1, is_protected: true,
      },
      { title: 'Namaz', kind: 'habit', area: 'spiritual', times_per_week: 3, is_untracked: true },
      { title: 'Su', kind: 'habit', area: 'health', times_per_week: 7, times_per_day: 5 },
      { title: 'Rapor', kind: 'task', area: null, days_of_week: [5], estimated_minutes: 30 },
    ],
    goals: [
      { title: 'İş başvurusu', horizon: 'week', target: 10, unit: 'başvuru', count_mode: 'tasks', daily_cap: 2 },
      { title: 'Claude stabilizasyonu', horizon: 'month', daily_cap: 1, steps: ['Adım 1', 'Adım 2'] },
    ],
    tasks: [{ title: 'Pasaport', area: 'personal', estimated_minutes: 20 }],
    rules: { max_deep_tasks: 3, rollover: 'backlog', buffer_minutes: 15, about: 'Cuma namazı önemli.' },
    unsupported: ['Telefonsuz zaman ölçümü'],
  }
  assert.deepEqual(sanitizeLifeSetup(proposal), proposal)
  assert.deepEqual(sanitizeLifeSetup(sanitizeLifeSetup(proposal)), proposal, 'ikinci geçişte değişmemeli')
})

test('girdiyi değiştirmez', () => {
  const input = { routines: [block({ start_time: '9:00', days_of_week: [3, 1, 1] })], rules: { about: '  x ' } }
  const before = JSON.stringify(input)
  sanitizeLifeSetup(input)
  assert.equal(JSON.stringify(input), before)
})

test('başlık kırpılır, 200 karakterde kesilir; boş başlıklı öğe sessizce düşer', () => {
  assert.equal(routineOf(block({ title: '  Audit \n  eğitimi  ' }))?.title, 'Audit eğitimi')
  assert.equal(routineOf(block({ title: 'a'.repeat(300) }))?.title.length, 200)
  const emoji = routineOf(block({ title: '😀'.repeat(250) }))?.title ?? ''
  assert.equal(Array.from(emoji).length, 200, 'emoji ortadan bölünmemeli')

  const out = sanitizeLifeSetup({ routines: [block({ title: '   ' }), block({ title: 5 }), block({ title: undefined })] })
  assert.deepEqual(out.routines, [])
  assert.deepEqual(out.unsupported, [], 'gösterilecek başlığı olmayan öğe unsupported listesine girmez')
})

test('block: saat çifti ve en az bir gün zorunlu, yoksa atılır ve başlığıyla unsupported olur', () => {
  const dropped = [
    block({ start_time: undefined, end_time: undefined }),
    block({ end_time: undefined }),
    block({ start_time: undefined }),
    block({ start_time: '10:00', end_time: '09:00' }),
    block({ start_time: '10:00', end_time: '10:00' }),
    block({ start_time: '25:00' }),
    block({ days_of_week: [] }),
    block({ days_of_week: [7, -1, 1.5, '1'] }),
    block({ days_of_week: undefined }),
  ]
  const out = sanitizeLifeSetup({ routines: dropped })
  assert.deepEqual(out.routines, [])
  assert.deepEqual(out.unsupported, ['Audit'], 'aynı başlık tek kez')
  assert.equal(routineOf(block()) !== null, true)
})

test('saatler HH:MM biçimine getirilir; günler tekilleşip sıralanır', () => {
  const r = routineOf(block({ start_time: '9:05', end_time: '10:00:30', days_of_week: [5, 1, 1, 3, 9] }))
  assert.equal(r?.start_time, '09:05')
  assert.equal(r?.end_time, '10:00')
  assert.deepEqual(r?.days_of_week, [1, 3, 5])
})

test('task: en az bir gün zorunlu; geçersiz saat çifti öğeyi düşürmez, yalnızca saatleri atar', () => {
  assert.equal(routineOf({ title: 'Rapor', kind: 'task' }), null)
  assert.equal(routineOf({ title: 'Rapor', kind: 'task', days_of_week: [] }), null)

  const r = routineOf({ title: 'Rapor', kind: 'task', days_of_week: [2], start_time: '11:00', end_time: '10:00' })
  assert.deepEqual(r, { title: 'Rapor', kind: 'task', area: null, days_of_week: [2] })

  const timed = routineOf({ title: 'Rapor', kind: 'task', days_of_week: [2], start_time: '11:00', end_time: '12:00' })
  assert.equal(timed?.start_time, '11:00')
})

test('habit: times_per_week 1..7 tam sayı zorunlu, gün listesi yok sayılır', () => {
  for (const bad of [undefined, 0, 8, 2.5, '3', null, NaN]) {
    assert.equal(routineOf(habit({ times_per_week: bad })), null, String(bad))
  }
  for (const good of [1, 7]) {
    assert.equal(routineOf(habit({ times_per_week: good }))?.times_per_week, good)
  }
  const r = routineOf(habit({ days_of_week: [1, 2, 3] }))
  assert.equal(r?.days_of_week, undefined)
  assert.equal('days_of_week' in (r ?? {}), false)
})

test('times_per_day yalnızca habit için, 061 sınırı 2..20; verilince times_per_week 7 olur', () => {
  assert.equal(routineOf(habit({ times_per_day: 5 }))?.times_per_day, 5)
  assert.equal(routineOf(habit({ times_per_day: 5, times_per_week: 3 }))?.times_per_week, 7)
  assert.equal(routineOf(habit({ times_per_day: 5, times_per_week: undefined }))?.times_per_week, 7)
  for (const bad of [0, 1, 21, 2.5, '3']) {
    const r = routineOf(habit({ times_per_day: bad }))
    assert.equal(r?.times_per_day, undefined, String(bad))
    assert.equal(r?.times_per_week, 3, 'geçersiz times_per_day haftalık hedefi bozmaz')
  }
  assert.equal(routineOf(block({ times_per_day: 5 }))?.times_per_day, undefined)
  assert.equal(routineOf({ title: 'Rapor', kind: 'task', days_of_week: [1], times_per_day: 5 })?.times_per_day, undefined)
})

test('times_per_week yalnızca habit için taşınır', () => {
  assert.equal(routineOf(block({ times_per_week: 3 }))?.times_per_week, undefined)
})

test('geçersiz kind atılır', () => {
  for (const kind of ['event', '', 5, undefined, 'BLOCK']) {
    assert.equal(routineOf(block({ kind })), null, String(kind))
  }
})

test('target_count 1..999, start_count < target_count; ihlal alanı atar, öğeyi düşürmez', () => {
  const r = routineOf(block({ target_count: 42, start_count: 1 }))
  assert.equal(r?.target_count, 42)
  assert.equal(r?.start_count, 1)

  assert.equal(routineOf(block({ target_count: 999 }))?.target_count, 999)
  for (const bad of [0, -1, 1000, 4.2, '42']) {
    const dropped = routineOf(block({ target_count: bad, start_count: 1 }))
    assert.notEqual(dropped, null, 'öğe yaşar')
    assert.equal(dropped?.target_count, undefined, String(bad))
    assert.equal(dropped?.start_count, undefined, 'hedefsiz start_count anlamsız')
  }

  for (const start of [42, 43, 100, -1, 0.5]) {
    const over = routineOf(block({ target_count: 42, start_count: start }))
    assert.equal(over?.target_count, 42)
    assert.equal(over?.start_count, undefined, String(start))
  }
  assert.equal(routineOf(block({ target_count: 42, start_count: 41 }))?.start_count, 41)
  assert.equal(routineOf(block({ target_count: 1, start_count: 0 }))?.start_count, undefined)
  assert.equal(routineOf(block({ target_count: 42, start_count: 0 }))?.start_count, undefined, '0 varsayılandır')
})

test('min_minutes 1..600, estimated_minutes 1..1440', () => {
  assert.equal(routineOf(block({ min_minutes: 1 }))?.min_minutes, 1)
  assert.equal(routineOf(block({ min_minutes: 600 }))?.min_minutes, 600)
  assert.equal(routineOf(block({ estimated_minutes: 1440 }))?.estimated_minutes, 1440)
  for (const bad of [0, 601, -5, 7.5, '30']) {
    assert.equal(routineOf(block({ min_minutes: bad }))?.min_minutes, undefined, String(bad))
  }
  for (const bad of [0, 1441, -5, 7.5, '30']) {
    assert.equal(routineOf(block({ estimated_minutes: bad }))?.estimated_minutes, undefined, String(bad))
  }
})

test('alan beş değerden biri ya da null; block_type geçerli değilse atılır', () => {
  assert.equal(routineOf(block({ area: 'spiritual' }))?.area, 'spiritual')
  for (const bad of ['work', '', 3, undefined]) {
    assert.equal(routineOf(block({ area: bad }))?.area, null, String(bad))
  }
  assert.equal(routineOf(block({ block_type: 'workout' }))?.block_type, 'workout')
  assert.equal(routineOf(block({ block_type: 'meeting' }))?.block_type, undefined)
})

test('is_protected ve is_untracked yalnızca true ise yazılır', () => {
  const on = routineOf(block({ is_protected: true, is_untracked: true }))
  assert.equal(on?.is_protected, true)
  assert.equal(on?.is_untracked, true)
  const off = routineOf(block({ is_protected: 'true', is_untracked: 1 }))
  assert.equal(off?.is_protected, undefined)
  assert.equal(off?.is_untracked, undefined)
})

test('task alanı: alan geçersizse null, süre sınırı 1..1440', () => {
  const out = sanitizeLifeSetup({
    tasks: [
      { title: 'A', area: 'health', estimated_minutes: 1440 },
      { title: 'B', area: 'x', estimated_minutes: 1441 },
      { title: 'C' },
    ],
  })
  assert.deepEqual(out.tasks, [
    { title: 'A', area: 'health', estimated_minutes: 1440 },
    { title: 'B', area: null },
    { title: 'C', area: null },
  ])
})

test('hedef: horizon geçerli olmalı, yoksa atılır', () => {
  assert.equal(goalOf({ horizon: 'week' })?.horizon, 'week')
  for (const bad of ['year', '', 5, undefined]) {
    assert.equal(goalOf({ horizon: bad }), null, String(bad))
  }
  const out = sanitizeLifeSetup({ goals: [{ title: 'Yıllık', horizon: 'year' }] })
  assert.deepEqual(out.unsupported, ['Yıllık'])
})

test('hedef: target ile count_mode birlikte gelir (059), eksikse görev sayısı varsayılır', () => {
  assert.deepEqual(goalOf({ target: 10, unit: 'başvuru', count_mode: 'hours' }), {
    title: 'Hedef', horizon: 'week', target: 10, unit: 'başvuru', count_mode: 'hours',
  })
  assert.equal(goalOf({ target: 10 })?.count_mode, 'tasks')
  assert.equal(goalOf({ target: 10, count_mode: 'weeks' })?.count_mode, 'tasks')
  // Hedefsiz sayım biçimi ve birim anlamsız, DB de reddeder.
  assert.deepEqual(goalOf({ count_mode: 'hours', unit: 'saat' }), { title: 'Hedef', horizon: 'week' })
  for (const bad of [0, -2, NaN, Infinity, '10']) {
    assert.deepEqual(goalOf({ target: bad, count_mode: 'tasks', unit: 'x' }), { title: 'Hedef', horizon: 'week' }, String(bad))
  }
  assert.equal(goalOf({ target: 2.5, count_mode: 'hours' })?.target, 2.5)
  assert.equal(goalOf({ target: 3, unit: 'u'.repeat(50) })?.unit?.length, 20)
})

test('hedef: daily_cap 1..10', () => {
  assert.equal(goalOf({ daily_cap: 1 })?.daily_cap, 1)
  assert.equal(goalOf({ daily_cap: 10 })?.daily_cap, 10)
  for (const bad of [0, 11, -1, 1.5, '2']) {
    assert.equal(goalOf({ daily_cap: bad })?.daily_cap, undefined, String(bad))
  }
})

test('hedef: steps en çok 12, boşlar atılır, başlıklar kırpılır', () => {
  const steps = Array.from({ length: 15 }, (_, i) => `Adım ${i + 1}`)
  assert.deepEqual(goalOf({ steps })?.steps, steps.slice(0, 12))
  assert.deepEqual(goalOf({ steps: ['  a  ', '', '   ', 5, null, 'b'] })?.steps, ['a', 'b'])
  assert.equal(goalOf({ steps: ['x'.repeat(300)] })?.steps?.[0]?.length, 200)
  assert.equal(goalOf({ steps: [] })?.steps, undefined)
  assert.equal(goalOf({ steps: 'tek adım' })?.steps, undefined)
})

test('liste tavanları: 20 rutin, 10 hedef, 30 görev; taşanın başlığı unsupported olur', () => {
  const routines = Array.from({ length: 25 }, (_, i) => block({ title: `R${i + 1}` }))
  const goals = Array.from({ length: 12 }, (_, i) => ({ title: `G${i + 1}`, horizon: 'week' }))
  const tasks = Array.from({ length: 35 }, (_, i) => ({ title: `T${i + 1}` }))
  const out = sanitizeLifeSetup({ routines, goals, tasks })
  assert.equal(out.routines.length, 20)
  assert.equal(out.goals.length, 10)
  assert.equal(out.tasks.length, 30)
  assert.equal(out.routines[19]?.title, 'R20')
  assert.equal(out.unsupported.length, 10, 'unsupported tavanı 10')
  assert.deepEqual(out.unsupported.slice(0, 5), ['R21', 'R22', 'R23', 'R24', 'R25'])
})

test('unsupported: yalnızca metinler, kırpılır, tekilleşir, en çok 10', () => {
  const out = sanitizeLifeSetup({ unsupported: ['  a ', 'a', '', 5, null, 'b', 'c'.repeat(400)] })
  assert.deepEqual(out.unsupported, ['a', 'b', 'c'.repeat(300)])

  const many = sanitizeLifeSetup({ unsupported: Array.from({ length: 25 }, (_, i) => `u${i}`) })
  assert.equal(many.unsupported.length, 10)
  assert.equal(many.unsupported[0], 'u0')

  // AI'nin kendi listesi önce gelir, atılan öğeler sonra eklenir.
  const mixed = sanitizeLifeSetup({ unsupported: ['ai'], routines: [block({ start_time: undefined })] })
  assert.deepEqual(mixed.unsupported, ['ai', 'Audit'])
})

test('summary kırpılır ve 1000 karakterde kesilir', () => {
  assert.equal(sanitizeLifeSetup({ summary: '  Plan \n hazır ' }).summary, 'Plan hazır')
  assert.equal(sanitizeLifeSetup({ summary: 's'.repeat(2000) }).summary.length, 1000)
  assert.equal(sanitizeLifeSetup({ summary: 7 }).summary, '')
})

test('kurallar: yalnızca gelen anahtarlar, sınırlar resolvePlanningRules ile aynı', () => {
  assert.deepEqual(sanitizeLifeSetup({ rules: {} }).rules, {})
  assert.deepEqual(sanitizeLifeSetup({ rules: { rollover: 'backlog' } }).rules, { rollover: 'backlog' })
  assert.deepEqual(sanitizeLifeSetup({ rules: { max_deep_tasks: 99, buffer_minutes: -5 } }).rules, {
    max_deep_tasks: 5, buffer_minutes: 0,
  })
  assert.equal(sanitizeLifeSetup({ rules: { max_deep_tasks: 0 } }).rules.max_deep_tasks, 1)
  assert.equal(sanitizeLifeSetup({ rules: { max_deep_tasks: 2.6 } }).rules.max_deep_tasks, 3)
  assert.equal(sanitizeLifeSetup({ rules: { buffer_minutes: 90 } }).rules.buffer_minutes, 60)
  assert.equal(sanitizeLifeSetup({ rules: { buffer_minutes: 0 } }).rules.buffer_minutes, 0)
})

test('kurallar: geçersiz değer anahtarı eklemez, varsayılan uydurmaz', () => {
  const bad = { max_deep_tasks: '3', buffer_minutes: NaN, rollover: 'weekly', about: 5, ek: 1 }
  assert.deepEqual(sanitizeLifeSetup({ rules: bad }).rules, {})
  assert.deepEqual(sanitizeLifeSetup({ rules: { about: '   ' } }).rules, {})
  assert.deepEqual(sanitizeLifeSetup({ rules: [1, 2] }).rules, {})
})

test('kurallar: about kırpılır ve 2000 karakterde kesilir', () => {
  assert.equal(sanitizeLifeSetup({ rules: { about: '  Cuma namazı  ' } }).rules.about, 'Cuma namazı')
  assert.equal(sanitizeLifeSetup({ rules: { about: 'a'.repeat(3000) } }).rules.about?.length, 2000)
})

// Veritabanı sahtesi: yazmaları sırayla kaydeder, eklenen satırlara kimlik verir.
interface Write { table: string; op: 'insert' | 'update'; payload: unknown; filters: Array<[string, unknown]> }
interface Chain {
  insert(payload: unknown): Chain
  update(payload: unknown): Chain
  select(): Chain
  single(): Chain
  maybeSingle(): Chain
  eq(column: string, value: unknown): Chain
  then(ok: (r: unknown) => unknown, fail: (e: unknown) => unknown): Promise<unknown>
}

function fakeDb(options: { preferences?: Rec; failTable?: string } = {}) {
  const writes: Write[] = []
  const rpcs: string[] = []
  let seq = 0

  const from = (table: string): Chain => {
    let write: Write | null = null
    let single = false
    const settle = (): { data: unknown; error: { message: string } | null } => {
      if (!write) return { data: { preferences: options.preferences ?? {} }, error: null }
      if (table === options.failTable) return { data: null, error: { message: `${table} hata` } }
      if (write.op === 'insert') {
        const rows = (Array.isArray(write.payload) ? write.payload : [write.payload]) as Rec[]
        const stored = rows.map((row) => ({ ...row, id: `${table}-${++seq}` }))
        return { data: single ? stored[0] : stored, error: null }
      }
      const id = write.filters.find(([column]) => column === 'id')?.[1]
      return { data: single ? { ...(write.payload as Rec), id } : null, error: null }
    }
    const begin = (op: Write['op'], payload: unknown): Chain => {
      write = { table, op, payload, filters: [] }
      writes.push(write)
      return chain
    }
    const chain: Chain = {
      insert: (payload) => begin('insert', payload),
      update: (payload) => begin('update', payload),
      select: () => chain,
      single: () => { single = true; return chain },
      maybeSingle: () => { single = true; return chain },
      eq: (column, value) => { write?.filters.push([column, value]); return chain },
      then: (ok, fail) => Promise.resolve(settle()).then(ok, fail),
    }
    return chain
  }

  const client = {
    from,
    rpc: async (name: string) => { rpcs.push(name); return { data: 0, error: null } },
  }
  return { client: client as unknown as SupabaseClient, writes, rpcs }
}

const inserts = (writes: Write[], table: string): Write[] => writes.filter((w) => w.table === table && w.op === 'insert')

test('applyLifeSetup: rutin, hedef, adım, görev ve kuralları yazar, sayıları döner', async () => {
  const db = fakeDb({ preferences: { theme: 'dark' } })
  const proposal = sanitizeLifeSetup({
    routines: [block({ title: 'Audit', target_count: 42, start_count: 1, area: 'career' }), habit({ title: 'Namaz' })],
    goals: [
      { title: 'Başvuru', horizon: 'week', target: 10, count_mode: 'tasks', unit: 'adet', daily_cap: 2 },
      { title: 'Claude', horizon: 'month', daily_cap: 1, steps: ['Birinci', 'İkinci'] },
    ],
    tasks: [{ title: 'Pasaport', area: 'personal', estimated_minutes: 20 }],
    rules: { rollover: 'backlog', max_deep_tasks: 2 },
  })

  const result = await applyLifeSetup(db.client, 'user-1', proposal)

  assert.deepEqual(result, { routines: 2, goals: 2, tasks: 3 })

  // Rutinler: şablon alanları olduğu gibi, örnek üretimi createRoutine ile her rutinde tetiklenir.
  const routines = inserts(db.writes, 'routines').map((w) => w.payload as Rec)
  assert.equal(routines.length, 2)
  assert.deepEqual(
    { title: routines[0]!['title'], target_count: routines[0]!['target_count'], start_count: routines[0]!['start_count'], area: routines[0]!['area'], user_id: routines[0]!['user_id'] },
    { title: 'Audit', target_count: 42, start_count: 1, area: 'career', user_id: 'user-1' },
  )
  assert.equal(routines[1]!['times_per_week'], 3)
  assert.deepEqual(db.rpcs, ['materialize_my_routines', 'materialize_my_routines'])

  // Hedefler: periyot başlangıcı mevcut yardımcıdan, daily_cap geçer.
  const goals = inserts(db.writes, 'goals').map((w) => (w.payload as Rec[])[0]!)
  assert.equal(goals[0]!['period_start'], goalPeriodStart('week', todayDate()))
  assert.equal(goals[1]!['period_start'], goalPeriodStart('month', todayDate()))
  assert.equal(goals[0]!['daily_cap'], 2)
  assert.equal(goals[0]!['target'], 10)
  assert.equal(goals[1]!['target'], null)
  assert.equal(goals[1]!['count_mode'], null)

  // Adımlar backlog görevi, hedefe bağlanır ve değer puanı en az 4 olur.
  const taskInserts = inserts(db.writes, 'tasks').map((w) => w.payload as Rec[])
  assert.deepEqual(taskInserts[0]!.map((t) => t['title']), ['Birinci', 'İkinci'])
  assert.equal(taskInserts[0]![0]!['status'], 'backlog')
  assert.equal(taskInserts[0]![0]!['scheduled_date'], null)
  const links = db.writes.filter((w) => w.table === 'tasks' && w.op === 'update')
  assert.equal(links.length, 2)
  for (const link of links) {
    assert.deepEqual(link.payload, { goal_id: 'goals-4', value_score: 4 })
  }
  assert.deepEqual(links.map((l) => l.filters[0]![0]), ['id', 'id'])

  // Tekil görev: alan ve süre yazılır, hedefe bağlanmaz.
  assert.equal(taskInserts[1]![0]!['title'], 'Pasaport')
  assert.equal(taskInserts[1]![0]!['area'], 'personal')
  assert.equal(taskInserts[1]![0]!['estimated_minutes'], 20)

  // Kurallar: diğer tercih anahtarları korunur.
  const profile = db.writes.find((w) => w.table === 'user_profiles')
  assert.deepEqual(profile?.payload, {
    preferences: { theme: 'dark', planning: { max_deep_tasks: 2, rollover: 'backlog', buffer_minutes: 15, about: '' } },
  })
})

test('applyLifeSetup: boş öneri hiçbir şey yazmaz', async () => {
  const db = fakeDb()
  assert.deepEqual(await applyLifeSetup(db.client, 'u', EMPTY), { routines: 0, goals: 0, tasks: 0 })
  assert.equal(db.writes.length, 0)
  assert.equal(db.rpcs.length, 0)
})

test('applyLifeSetup: kuralsız öneride profile dokunmaz', async () => {
  const db = fakeDb()
  await applyLifeSetup(db.client, 'u', { ...EMPTY, tasks: [{ title: 'A', area: null }] })
  assert.equal(db.writes.some((w) => w.table === 'user_profiles'), false)
})

test('applyLifeSetup: yazmadan önce yeniden doğrular, kısıt ihlali veritabanına gitmez', async () => {
  const db = fakeDb()
  const unsafe = {
    ...EMPTY,
    routines: [{ title: 'Saatsiz blok', kind: 'block', area: null, days_of_week: [1] }],
    goals: [{ title: 'Hatalı', horizon: 'year' }],
    rules: { max_deep_tasks: 50 },
  } as unknown as LifeSetupProposal

  const result = await applyLifeSetup(db.client, 'u', unsafe)

  assert.deepEqual(result, { routines: 0, goals: 0, tasks: 0 })
  assert.equal(inserts(db.writes, 'routines').length, 0)
  assert.equal(inserts(db.writes, 'goals').length, 0)
  const profile = db.writes.find((w) => w.table === 'user_profiles')
  assert.deepEqual(profile?.payload, {
    preferences: { planning: { max_deep_tasks: 5, rollover: 'carry', buffer_minutes: 15, about: '' } },
  })
})

test('applyLifeSetup: veritabanı hatası yukarı fırlar ve sonraki adımlar çalışmaz', async () => {
  const db = fakeDb({ failTable: 'goals' })
  const proposal = sanitizeLifeSetup({
    goals: [{ title: 'Hedef', horizon: 'week' }],
    tasks: [{ title: 'Görev' }],
    rules: { rollover: 'backlog' },
  })
  await assert.rejects(applyLifeSetup(db.client, 'u', proposal))
  assert.equal(inserts(db.writes, 'tasks').length, 0)
  assert.equal(db.writes.some((w) => w.table === 'user_profiles'), false)
})
