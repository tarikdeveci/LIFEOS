import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { useReportStore } from '../../packages/shared/src/stores/reportStore.ts'
import { useRoutineStore } from '../../packages/shared/src/stores/routineStore.ts'
import { todayDate } from '../../packages/shared/src/utils/date.ts'
import type { DailyReport, DayCheckin, DayItem, DayNarrative } from '../../packages/shared/src/types/report.ts'
import type { Routine } from '../../packages/shared/src/types/routine.ts'

// Sahte istemci: daily-report / ai-suggest çağrıları testin verdiği sözle (promise) çözülür,
// böylece sunucu yanıt sırası elle kurulabilir. routine_completions yazmaları anında başarılıdır.
interface Call {
  fn: string
  body: Record<string, unknown>
  resolve: (data: unknown) => void
  fail: (message: string) => void
}
interface Rpc { table: string; op: 'upsert' | 'delete'; row?: Record<string, unknown> }

function fakeSupabase() {
  const calls: Call[] = []
  const rpcs: Rpc[] = []
  const client = {
    functions: {
      invoke: (fn: string, opts: { body: Record<string, unknown> }) =>
        new Promise<{ data: unknown; error: unknown }>((done) => {
          calls.push({
            fn,
            body: opts.body,
            resolve: (data) => done({ data, error: null }),
            fail: (message) => done({ data: null, error: new Error(message) }),
          })
        }),
    },
    from: (table: string) => {
      const ok = (rpc: Rpc) => {
        rpcs.push(rpc)
        return Promise.resolve({ error: null })
      }
      const chain = {
        eq: () => chain,
        then: (res: (r: unknown) => unknown, rej: (e: unknown) => unknown) => ok({ table, op: 'delete' }).then(res, rej),
      }
      return {
        upsert: (row: Record<string, unknown>) => ok({ table, op: 'upsert', row }),
        delete: () => chain,
      }
    },
  }
  return { client: client as unknown as SupabaseClient, calls, rpcs }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

// Fixture kurucuları: DayItem / rapor alanı eklemek tek satır.
const item = (over: Partial<DayItem> = {}): DayItem => ({
  key: 'task:t1',
  kind: 'task',
  title: 'Görev',
  area: null,
  minutes: null,
  start_time: null,
  expected: true,
  outcome: 'open',
  reason: null,
  program: null,
  ...over,
})

const report = (date: string, items: DayItem[], checkin: DayCheckin = {}, over: Partial<DailyReport> = {}): DailyReport => ({
  user_id: 'u1',
  date,
  facts: {
    date,
    energy: null,
    items,
    focus_minutes: 0,
    movement: { exercise_minutes: null, steps: null, workout_done: false },
    nutrition: null,
    habits_week: [],
    generated_at: '2026-10-01T00:00:00Z',
  },
  checkin,
  narrative: null,
  opened_at: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...over,
})

const narrative = (headline: string): DayNarrative => ({
  source: 'ai', headline, went_well: [], postponed: [], suggestion: '', future_self: '',
})

/** Sunucu gibi: gelen checkin'i olduğu gibi yazıp raporu döner. */
const echo = (call: Call, items: DayItem[], date: string) =>
  call.resolve({ report: report(date, items, (call.body['checkin'] as DayCheckin | undefined) ?? {}) })

let counter = 0
/** Her test kendi gününü ve kullanıcısını kullanır (modül düzeyi önbellekler testler arası sızmasın). */
async function open(items: DayItem[], checkin: DayCheckin = {}) {
  const date = `2026-01-${String(++counter).padStart(2, '0')}`
  const user = `user-${counter}`
  const fake = fakeSupabase()
  const pending = useReportStore.getState().fetchReport(fake.client, user, date, 'tr')
  await tick()
  fake.calls[0]!.resolve({ report: report(date, items, checkin) })
  await pending
  fake.calls.length = 0
  return { ...fake, date, user }
}

const shown = (date: string) => useReportStore.getState().reports[date]!
const marks = (date: string) => shown(date).checkin.items ?? {}

test('setItemMark: sunucuya TAM checkin gider, önceki işaretler korunur', async () => {
  const items = [item({ key: 'task:a' }), item({ key: 'task:b' })]
  const { client, calls, date } = await open(items, { items: { 'task:a': { outcome: 'partial' } }, note: 'not' })

  const write = useReportStore.getState().setItemMark(client, date, 'tr', 'task:b', { outcome: 'skipped', reason: 'time' })
  await tick()

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0]!.body['checkin'], {
    items: { 'task:a': { outcome: 'partial' }, 'task:b': { outcome: 'skipped', reason: 'time' } },
    note: 'not',
  })
  echo(calls[0]!, items, date)
  await write
  assert.deepEqual(Object.keys(marks(date)).sort(), ['task:a', 'task:b'])
})

test('setItemMark: null işareti yalnız o öğenin işaretini kaldırır, diğeri kalır', async () => {
  const items = [item({ key: 'task:a' }), item({ key: 'task:b' })]
  const { client, calls, date } = await open(items, {
    items: { 'task:a': { outcome: 'partial' }, 'task:b': { outcome: 'skipped', reason: 'energy' } },
  })

  const write = useReportStore.getState().setItemMark(client, date, 'tr', 'task:a', null)
  await tick()

  assert.deepEqual(calls[0]!.body['checkin'], { items: { 'task:b': { outcome: 'skipped', reason: 'energy' } } })
  assert.deepEqual(Object.keys(marks(date)), ['task:b'], 'ekran yanıttan önce de güncel')
  echo(calls[0]!, items, date)
  await write
})

test('setItemMark: bilinmeyen öğe ya da açılmamış gün ağa gitmez', async () => {
  const { client, calls, date } = await open([item()])
  await useReportStore.getState().setItemMark(client, date, 'tr', 'task:yok', { outcome: 'partial' })
  await useReportStore.getState().setItemMark(client, '1999-01-01', 'tr', 'task:t1', { outcome: 'partial' })
  assert.equal(calls.length, 0)
})

test('setItemMark: iyimser yazma ekrana hemen işlenir, hata olursa son doğrulanmış hâle dönülür', async () => {
  const items = [item()]
  const { client, calls, date } = await open(items, { items: { 'task:t1': { outcome: 'partial' } } })

  const write = useReportStore.getState().setItemMark(client, date, 'tr', 'task:t1', { outcome: 'skipped', reason: 'avoided' })
  await tick()
  assert.equal(marks(date)['task:t1']?.outcome, 'skipped', 'iyimser hâl görünür')

  calls[0]!.fail('ağ koptu')
  await assert.rejects(write, /ağ koptu/)
  assert.deepEqual(marks(date), { 'task:t1': { outcome: 'partial' } }, 'son doğrulanmış hâle dönüldü')
})

test('setItemMark: sıralı iki yazma sırayla gider, yalnız en yeninin yanıtı ekrana işlenir', async () => {
  const items = [item({ key: 'task:a' }), item({ key: 'task:b' })]
  const { client, calls, date } = await open(items)
  const store = useReportStore.getState()

  const first = store.setItemMark(client, date, 'tr', 'task:a', { outcome: 'partial' })
  const second = store.setItemMark(client, date, 'tr', 'task:b', { outcome: 'skipped' })
  await tick()
  assert.equal(calls.length, 1, 'ikinci yazma ilk yanıt gelmeden gönderilmez')

  // İlk yanıt (yalnız a) geldiğinde ekran hâlâ ikinci iyimser hâli göstermeli.
  calls[0]!.resolve({ report: report(date, items, { items: { 'task:a': { outcome: 'partial' } } }) })
  await first
  await tick()
  assert.deepEqual(Object.keys(marks(date)).sort(), ['task:a', 'task:b'], 'eski yanıt yeniyi ezmedi')

  assert.equal(calls.length, 2)
  assert.deepEqual(Object.keys((calls[1]!.body['checkin'] as DayCheckin).items ?? {}).sort(), ['task:a', 'task:b'])
  echo(calls[1]!, items, date)
  await second
  assert.deepEqual(Object.keys(marks(date)).sort(), ['task:a', 'task:b'])
})

test('setItemMark: ilk yazma tutar, ikincisi düşerse ilkinin doğrulanmış hâli kalır', async () => {
  const items = [item({ key: 'task:a' }), item({ key: 'task:b' })]
  const { client, calls, date } = await open(items)
  const store = useReportStore.getState()

  const first = store.setItemMark(client, date, 'tr', 'task:a', { outcome: 'partial' })
  const second = store.setItemMark(client, date, 'tr', 'task:b', { outcome: 'skipped' })
  await tick()
  calls[0]!.resolve({ report: report(date, items, { items: { 'task:a': { outcome: 'partial' } } }) })
  await first
  await tick()
  calls[1]!.fail('500')
  await assert.rejects(second)
  assert.deepEqual(Object.keys(marks(date)), ['task:a'], 'ikinci düştü: birinci doğrulanmış hâle dönüldü')
})

test('setItemMark: şablon anlatıdaki o öğenin eski notu hemen düşer', async () => {
  const items = [item({ title: 'Rapor' })]
  const { client, calls, date } = await open(items)
  const withNote = report(date, items, {}, {
    narrative: { ...narrative('b'), source: 'template', postponed: [{ title: 'Rapor', note: 'eski' }, { title: 'Diğer', note: 'kalsın' }] },
  })
  useReportStore.setState((s) => ({ reports: { ...s.reports, [date]: withNote } }))

  const write = useReportStore.getState().setItemMark(client, date, 'tr', 'task:t1', { outcome: 'partial' })
  await tick()
  assert.deepEqual(shown(date).narrative?.postponed.map((p) => p.title), ['Diğer'])
  echo(calls[0]!, items, date)
  await write
})

test('fetchReport: başka kullanıcı girince önbellek boşalır', async () => {
  const { client, calls, date } = await open([item()])
  assert.ok(useReportStore.getState().reports[date])

  const pending = useReportStore.getState().fetchReport(client, 'baska-kullanici', '2026-02-01', 'tr')
  assert.deepEqual(useReportStore.getState().reports, {}, 'önceki kullanıcının raporu hemen gitti')
  assert.equal(useReportStore.getState().userId, 'baska-kullanici')
  await tick()
  calls[0]!.resolve({ report: report('2026-02-01', [item()]) })
  await pending
  assert.deepEqual(Object.keys(useReportStore.getState().reports), ['2026-02-01'])
})

test('fetchReport: kullanıcı değişince eski kullanıcının geç gelen yanıtı yazılmaz', async () => {
  const fake = fakeSupabase()
  const store = useReportStore.getState()
  const old = store.fetchReport(fake.client, 'eski', '2026-03-01', 'tr')
  await tick()
  const fresh = store.fetchReport(fake.client, 'yeni', '2026-03-02', 'tr')
  await tick()
  fake.calls[0]!.resolve({ report: report('2026-03-01', [item()]) })
  await old
  assert.equal(useReportStore.getState().reports['2026-03-01'], undefined)
  fake.calls[1]!.resolve({ report: report('2026-03-02', [item()]) })
  await fresh
  assert.ok(useReportStore.getState().reports['2026-03-02'])
})

test('fetchReport: yazma sürerken başlayan eski okuma yeni yazmayı ezmez', async () => {
  const items = [item()]
  const { client, calls, date, user } = await open(items)
  const store = useReportStore.getState()

  const read = store.fetchReport(client, user, date, 'tr')
  await tick()
  const write = store.setItemMark(client, date, 'tr', 'task:t1', { outcome: 'partial' })
  await tick()
  assert.equal(calls.length, 2)

  // Okuma yazmadan sonra döner ama yazmadan ÖNCE başladı: işaretsiz eski hâli getirir.
  calls[0]!.resolve({ report: report(date, items, {}) })
  await read
  assert.equal(marks(date)['task:t1']?.outcome, 'partial', 'okuma iyimser yazmayı ezmedi')

  echo(calls[1]!, items, date)
  await write
  assert.equal(marks(date)['task:t1']?.outcome, 'partial')
})

test('fetchReport: aynı gün çift okumada yalnız sonuncunun yanıtı işlenir', async () => {
  const { client, calls, date, user } = await open([item()])
  const store = useReportStore.getState()
  const a = store.fetchReport(client, user, date, 'tr')
  const b = store.fetchReport(client, user, date, 'en')
  await tick()
  calls[1]!.resolve({ report: report(date, [item({ title: 'yeni' })]) })
  await b
  calls[0]!.resolve({ report: report(date, [item({ title: 'eski' })]) })
  await a
  assert.equal(shown(date).facts.items[0]!.title, 'yeni')
  assert.equal(useReportStore.getState().loading[date], false)
})

test('fetchReport: hata mesajı errors içine yazılır, yükleme kapanır', async () => {
  const { client, calls, date, user } = await open([item()])
  const pending = useReportStore.getState().fetchReport(client, user, date, 'tr')
  await tick()
  calls[0]!.fail('sunucu yok')
  await pending
  assert.equal(useReportStore.getState().errors[date], 'sunucu yok')
  assert.equal(useReportStore.getState().loading[date], false)
})

test('fetchReport: opened yalnız istenince gönderilir', async () => {
  const { client, calls, date, user } = await open([item()])
  const store = useReportStore.getState()
  const a = store.fetchReport(client, user, date, 'tr', { opened: true })
  await tick()
  assert.equal(calls[0]!.body['opened'], true)
  calls[0]!.resolve({ report: report(date, [item()]) })
  await a
  const b = store.fetchReport(client, user, date, 'tr')
  await tick()
  assert.equal('opened' in calls[1]!.body, false)
  calls[1]!.resolve({ report: report(date, [item()]) })
  await b
})

test('requestInsight: yükleme sırasında ikinci çağrı ağa gitmez, anlatı ekrana işlenir', async () => {
  const { client, calls, date } = await open([item()])
  const store = useReportStore.getState()

  const first = store.requestInsight(client, date, 'tr')
  const second = store.requestInsight(client, date, 'tr')
  await tick()
  assert.equal(calls.length, 1)
  assert.equal(calls[0]!.fn, 'ai-suggest')
  assert.equal(useReportStore.getState().insightLoading[date], true)

  calls[0]!.resolve({ narrative: narrative('AI yorumu') })
  await Promise.all([first, second])
  assert.equal(shown(date).narrative?.headline, 'AI yorumu')
  assert.equal(useReportStore.getState().insightLoading[date], false)
})

test('requestInsight: hata fırlatılır, yükleme bayrağı kapanır, yeniden denenebilir', async () => {
  const { client, calls, date } = await open([item()])
  const store = useReportStore.getState()
  const failing = store.requestInsight(client, date, 'tr')
  await tick()
  calls[0]!.fail('402')
  await assert.rejects(failing, /402/)
  assert.equal(useReportStore.getState().insightLoading[date], false)

  const retry = store.requestInsight(client, date, 'tr')
  await tick()
  assert.equal(calls.length, 2, 'bayrak kapandı, yeni çağrı ağa gider')
  calls[1]!.resolve({ narrative: narrative('tamam') })
  await retry
})

test('requestInsight: bozuk yanıt hata sayılır', async () => {
  const { client, calls, date } = await open([item()])
  const p = useReportStore.getState().requestInsight(client, date, 'tr')
  await tick()
  calls[0]!.resolve({ narrative: { headline: 3 } })
  await assert.rejects(p, /anlatı gelmedi/)
})

// "Yaptım" geri alma: alışkanlık sayacı önceki değerine döner (sıfıra düşmez).
const habitRoutine = (id: string, perDay: number | null): Routine => ({ id, times_per_day: perDay } as unknown as Routine)

/** Bugünün raporunu açar (store yalnız içinde bulunulan haftanın sayaçlarını tutar). */
async function openToday(user: string, items: DayItem[]) {
  const today = todayDate()
  const fake = fakeSupabase()
  const pending = useReportStore.getState().fetchReport(fake.client, user, today, 'tr')
  await tick()
  fake.calls[0]!.resolve({ report: report(today, items) })
  await pending
  fake.calls.length = 0
  return { ...fake, today }
}

test('setItemDone: günde 3 kez alışkanlıkta geri alma önceki sayaca (1) döner', async () => {
  const habit = item({ key: 'habit:r1', kind: 'habit', title: 'Su' })
  const user = 'user-habit1'
  const { client, calls, rpcs, today } = await openToday(user, [habit])
  useRoutineStore.setState({
    routines: [habitRoutine('r1', 3)],
    completions: [{ routine_id: 'r1', user_id: user, completed_on: today, count: 1, created_at: 'x' }],
  })
  const countNow = () =>
    useRoutineStore.getState().completions.find((c) => c.routine_id === 'r1' && c.completed_on === today)?.count

  const done = useReportStore.getState().setItemDone(client, user, today, 'tr', 'habit:r1', true)
  await tick()
  await tick()
  assert.equal(countNow(), 3, 'yaptım: günlük hedefe çıkar')
  echo(calls[0]!, [{ ...habit, outcome: 'done' }], today)
  await done

  const undo = useReportStore.getState().setItemDone(client, user, today, 'tr', 'habit:r1', false)
  await tick()
  await tick()
  assert.equal(countNow(), 1, 'geri alma: sıfıra değil önceki sayaca döner')
  echo(calls[1]!, [habit], today)
  await undo

  assert.deepEqual(rpcs.map((r) => r.row?.['count']), [3, 1])
})

test('setItemDone: önceden işaretsiz alışkanlıkta geri alma sayacı siler', async () => {
  const habit = item({ key: 'habit:r2', kind: 'habit', title: 'Yürüyüş' })
  const user = 'user-habit0'
  const { client, calls, rpcs, today } = await openToday(user, [habit])
  useRoutineStore.setState({ routines: [habitRoutine('r2', null)], completions: [] })

  const done = useReportStore.getState().setItemDone(client, user, today, 'tr', 'habit:r2', true)
  await tick()
  await tick()
  echo(calls[0]!, [{ ...habit, outcome: 'done' }], today)
  await done
  const undo = useReportStore.getState().setItemDone(client, user, today, 'tr', 'habit:r2', false)
  await tick()
  await tick()
  echo(calls[1]!, [habit], today)
  await undo

  assert.deepEqual(rpcs.map((r) => r.op), ['upsert', 'delete'])
  assert.equal(rpcs[0]!.row?.['count'], 1, 'times_per_day yoksa tek işaret')
  assert.equal(useRoutineStore.getState().completions.length, 0)
})

test('setItemDone: zaten o durumdaki öğede hiçbir şey yazılmaz', async () => {
  const { client, calls, rpcs, date, user } = await open([item({ outcome: 'done' })])
  await useReportStore.getState().setItemDone(client, user, date, 'tr', 'task:t1', true)
  assert.equal(calls.length, 0)
  assert.equal(rpcs.length, 0)
})
