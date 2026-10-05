import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { applyLifeSetup } from '../../packages/shared/src/supabase/lifeSetup.ts'
import type { LifeSetupProposal } from '../../packages/shared/src/types/lifeSetup.ts'

type Rec = Record<string, unknown>
interface Write { table: string; op: 'insert' | 'update'; payload: unknown; filters: [string, unknown][] }

// Sahte veritabanı: yazmalar sırayla kaydedilir, istenen tablo/işlemde hata verir.
// Hiçbir şey geri alınmaz (gerçek veritabanı gibi): atomik olmayan davranış buradan görünür.
function fakeDb(opts: { preferences?: Rec; fail?: { table: string; op: 'insert' | 'update' } } = {}) {
  const writes: Write[] = []
  const seq: Record<string, number> = {}

  const from = (table: string) => {
    let write: Write | null = null
    let single = false
    const settle = () => {
      if (!write) return { data: { preferences: opts.preferences ?? {} }, error: null }
      if (opts.fail && opts.fail.table === table && opts.fail.op === write.op) {
        return { data: null, error: { message: `${table}.${write.op} hata` } }
      }
      if (write.op === 'insert') {
        const rows = (Array.isArray(write.payload) ? write.payload : [write.payload]) as Rec[]
        const stored = rows.map((row) => ({ ...row, id: `${table}-${(seq[table] = (seq[table] ?? 0) + 1)}` }))
        return { data: single ? stored[0] : stored, error: null }
      }
      const id = write.filters.find(([column]) => column === 'id')?.[1]
      return { data: single ? { ...(write.payload as Rec), id } : null, error: null }
    }
    const begin = (op: Write['op'], payload: unknown) => {
      write = { table, op, payload, filters: [] }
      writes.push(write)
      return chain
    }
    const chain = {
      insert: (payload: unknown) => begin('insert', payload),
      update: (payload: unknown) => begin('update', payload),
      select: () => chain,
      single: () => { single = true; return chain },
      maybeSingle: () => { single = true; return chain },
      eq: (column: string, value: unknown) => { write?.filters.push([column, value]); return chain },
      then: (ok: (r: unknown) => unknown, fail: (e: unknown) => unknown) => Promise.resolve(settle()).then(ok, fail),
    }
    return chain
  }

  const client = { from, rpc: async () => ({ data: 0, error: null }) }
  return { client: client as unknown as SupabaseClient, writes }
}

const insertsOf = (writes: Write[], table: string) => writes.filter((w) => w.table === table && w.op === 'insert')
const rowsOf = (w: Write) => (Array.isArray(w.payload) ? w.payload : [w.payload]) as Rec[]
const titlesOf = (writes: Write[], table: string) => insertsOf(writes, table).flatMap(rowsOf).map((r) => r['title'])

// Fixture kurucusu: öneriye alan eklemek tek satır.
const proposal = (over: Partial<LifeSetupProposal> = {}): LifeSetupProposal => ({
  summary: '', routines: [], goals: [], tasks: [], rules: {}, unsupported: [], ...over,
})
const habit = { title: 'Su', kind: 'habit', area: 'health', times_per_week: 3 } as const
const goal = (title: string, steps?: string[]) => ({ title, horizon: 'week', ...(steps ? { steps } : {}) }) as const

test('geçerli öneri doğru tablolara doğru alanlarla yazılır', async () => {
  const db = fakeDb()
  const result = await applyLifeSetup(db.client, 'u-1', proposal({
    routines: [habit],
    goals: [{ title: 'Başvuru', horizon: 'week', target: 10, unit: 'adet', count_mode: 'tasks', daily_cap: 2 }],
    tasks: [{ title: 'Pasaport', area: 'personal', estimated_minutes: 20 }],
    rules: { rollover: 'backlog' },
  }))

  assert.deepEqual(result, { routines: 1, goals: 1, tasks: 1 })

  const routine = rowsOf(insertsOf(db.writes, 'routines')[0]!)[0]!
  assert.equal(routine['user_id'], 'u-1')
  assert.equal(routine['title'], 'Su')
  assert.equal(routine['times_per_week'], 3)
  assert.equal(routine['area'], 'health')

  const goalRow = rowsOf(insertsOf(db.writes, 'goals')[0]!)[0]!
  assert.equal(goalRow['user_id'], 'u-1')
  assert.equal(goalRow['horizon'], 'week')
  assert.equal(goalRow['target'], 10)
  assert.equal(goalRow['unit'], 'adet')
  assert.equal(goalRow['count_mode'], 'tasks')
  assert.equal(goalRow['daily_cap'], 2)

  const task = rowsOf(insertsOf(db.writes, 'tasks')[0]!)[0]!
  assert.equal(task['user_id'], 'u-1')
  assert.equal(task['title'], 'Pasaport')
  assert.equal(task['status'], 'backlog')
  assert.equal(task['area'], 'personal')
  assert.equal(task['estimated_minutes'], 20)

  const profile = db.writes.find((w) => w.table === 'user_profiles')
  assert.equal(profile?.op, 'update')
  assert.equal(((profile?.payload as Rec)['preferences'] as Rec)['planning'] !== undefined, true)
})

test('hedef adımları kendi hedefine bağlanır, öteki hedefin ve tekil görevler bağsız kalır', async () => {
  const db = fakeDb()
  const result = await applyLifeSetup(db.client, 'u', proposal({
    goals: [goal('Birinci', ['A1', 'A2']), goal('İkinci', ['B1'])],
    tasks: [{ title: 'Tekil', area: null }],
  }))

  assert.deepEqual(result, { routines: 0, goals: 2, tasks: 4 }, 'tasks adımları da sayar')

  const links = db.writes.filter((w) => w.table === 'tasks' && w.op === 'update')
  const linkOf = (taskId: string) => links.find((l) => l.filters.some(([c, v]) => c === 'id' && v === taskId))
  // Kimlikler tablo başına sayılır: goals-1/2, tasks-1..3 adımlar (A1, A2, B1), tasks-4 tekil görev.
  assert.deepEqual(titlesOf(db.writes, 'goals'), ['Birinci', 'İkinci'])
  assert.deepEqual(titlesOf(db.writes, 'tasks'), ['A1', 'A2', 'B1', 'Tekil'])
  assert.equal(links.length, 3)
  assert.equal((linkOf('tasks-1')!.payload as Rec)['goal_id'], 'goals-1')
  assert.equal((linkOf('tasks-2')!.payload as Rec)['goal_id'], 'goals-1')
  assert.equal((linkOf('tasks-3')!.payload as Rec)['goal_id'], 'goals-2')
  assert.equal(linkOf('tasks-4'), undefined, 'tekil görev hedefe bağlanmaz')
  for (const link of links) {
    assert.deepEqual(link.payload && Object.keys(link.payload as Rec).sort(), ['goal_id', 'value_score'])
    assert.equal((link.payload as Rec)['value_score'], 4, 'hedefe bağlı görevin değer puanı en az 4')
  }
})

test('adımsız hedef görev yazmaz ve bağ güncellemesi yapmaz', async () => {
  const db = fakeDb()
  await applyLifeSetup(db.client, 'u', proposal({ goals: [goal('Yalın')] }))
  assert.equal(insertsOf(db.writes, 'tasks').length, 0)
  assert.equal(db.writes.some((w) => w.table === 'tasks'), false)
})

test('geçersiz öğe yeniden doğrulamada düşer, geçerli komşusu yazılır', async () => {
  const db = fakeDb()
  const unsafe = proposal({
    routines: [
      habit,
      { title: 'Saatsiz blok', kind: 'block', area: null, days_of_week: [1] },
      { title: 'Sayaçsız alışkanlık', kind: 'habit', area: null },
    ],
    goals: [goal('Geçerli'), { title: 'Hatalı ufuk', horizon: 'year' }],
    tasks: [{ title: '   ', area: null }, { title: 'Tamam', area: 'mars' }],
    rules: { max_deep_tasks: 99 },
  } as unknown as Partial<LifeSetupProposal>)

  const result = await applyLifeSetup(db.client, 'u', unsafe)

  assert.deepEqual(result, { routines: 1, goals: 1, tasks: 1 })
  assert.deepEqual(titlesOf(db.writes, 'routines'), ['Su'])
  assert.deepEqual(titlesOf(db.writes, 'goals'), ['Geçerli'])
  assert.deepEqual(titlesOf(db.writes, 'tasks'), ['Tamam'])
  assert.equal(rowsOf(insertsOf(db.writes, 'tasks')[0]!)[0]!['area'], null, 'geçersiz alan temizlenir')
  const planning = ((db.writes.find((w) => w.table === 'user_profiles')!.payload as Rec)['preferences'] as Rec)['planning'] as Rec
  assert.equal(planning['max_deep_tasks'], 5, 'kural üst sınıra kırpılır')
})

test('saçma girdi çökmez ve hiçbir şey yazmaz', async () => {
  for (const junk of [null, undefined, 42, 'x', [], { routines: 'x', goals: 5 }]) {
    const db = fakeDb()
    const result = await applyLifeSetup(db.client, 'u', junk as unknown as LifeSetupProposal)
    assert.deepEqual(result, { routines: 0, goals: 0, tasks: 0 })
    assert.equal(db.writes.length, 0)
  }
})

// Atomik değil: ortada hata fırlarsa o ana kadar yazılanlar kalır. Aşağıdaki testler bunu belgeler.
test('ATOMİK DEĞİL: hedef yazımı patlarsa rutinler kalır, hedefler/görevler/kurallar yazılmaz', async () => {
  const db = fakeDb({ fail: { table: 'goals', op: 'insert' } })
  await assert.rejects(
    applyLifeSetup(db.client, 'u', proposal({
      routines: [habit],
      goals: [goal('Hedef', ['Adım'])],
      tasks: [{ title: 'Tekil', area: null }],
      rules: { rollover: 'backlog' },
    })),
    { message: "goals.insert hata" },
  )
  assert.equal(insertsOf(db.writes, 'routines').length, 1, 'rutin zaten yazıldı, geri alınmaz')
  assert.equal(insertsOf(db.writes, 'tasks').length, 0)
  assert.equal(db.writes.some((w) => w.table === 'user_profiles'), false)
})

test('ATOMİK DEĞİL: adım bağlama patlarsa hedef ve bağsız adım görevleri kalır, tekil görev ve kurallar yazılmaz', async () => {
  const db = fakeDb({ fail: { table: 'tasks', op: 'update' } })
  await assert.rejects(
    applyLifeSetup(db.client, 'u', proposal({
      goals: [goal('Hedef', ['Adım 1', 'Adım 2'])],
      tasks: [{ title: 'Tekil', area: null }],
      rules: { rollover: 'backlog' },
    })),
    { message: "tasks.update hata" },
  )
  assert.deepEqual(titlesOf(db.writes, 'goals'), ['Hedef'], 'hedef kaldı')
  assert.deepEqual(titlesOf(db.writes, 'tasks'), ['Adım 1', 'Adım 2'], 'adımlar hedefe bağlanmadan kaldı')
  assert.equal(titlesOf(db.writes, 'tasks').includes('Tekil'), false)
  assert.equal(db.writes.some((w) => w.table === 'user_profiles'), false)
})

test('ATOMİK DEĞİL: kural yazımı son adımda patlarsa her şey yazılmış kalır', async () => {
  const db = fakeDb({ fail: { table: 'user_profiles', op: 'update' } })
  await assert.rejects(
    applyLifeSetup(db.client, 'u', proposal({
      routines: [habit],
      goals: [goal('Hedef')],
      tasks: [{ title: 'Tekil', area: null }],
      rules: { rollover: 'backlog' },
    })),
    { message: "user_profiles.update hata" },
  )
  assert.equal(insertsOf(db.writes, 'routines').length, 1)
  assert.equal(insertsOf(db.writes, 'goals').length, 1)
  assert.equal(insertsOf(db.writes, 'tasks').length, 1)
})

test('ATOMİK DEĞİL: aynı öneriyi iki kez uygulamak her şeyi ikiler (idempotent değil)', async () => {
  const db = fakeDb()
  const input = proposal({ routines: [habit], goals: [goal('Hedef')], tasks: [{ title: 'Tekil', area: null }] })
  await applyLifeSetup(db.client, 'u', input)
  await applyLifeSetup(db.client, 'u', input)
  assert.deepEqual(titlesOf(db.writes, 'routines'), ['Su', 'Su'])
  assert.deepEqual(titlesOf(db.writes, 'goals'), ['Hedef', 'Hedef'])
  assert.deepEqual(titlesOf(db.writes, 'tasks'), ['Tekil', 'Tekil'])
})

test('profil satırı yoksa kurallar yazılamaz ve hata fırlar', async () => {
  const db = fakeDb()
  const original = db.client.from.bind(db.client)
  const missingProfile = {
    from: (table: string) => {
      if (table !== 'user_profiles') return original(table)
      const chain: Rec = { select: () => chain, eq: () => chain, maybeSingle: () => chain, then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok) }
      return chain
    },
    rpc: async () => ({ data: 0, error: null }),
  } as unknown as SupabaseClient
  await assert.rejects(applyLifeSetup(missingProfile, 'u', proposal({ rules: { rollover: 'backlog' } })), /profile_not_found/)
})
