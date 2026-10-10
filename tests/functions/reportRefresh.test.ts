import { test } from 'node:test'
import assert from 'node:assert/strict'

import { resolveReportDate } from '../../supabase/functions/_shared/report/dates.ts'
import type { Db } from '../../supabase/functions/_shared/report/facts.ts'
import { ReportNotFoundError, refreshReport } from '../../supabase/functions/_shared/report/store.ts'
import type { DailyReport, DayFacts } from '../../supabase/functions/_shared/report/types.ts'
import { buildEveningReport } from '../../supabase/functions/daily-digest/evening.ts'

// ---------- sahte veritabanı ----------

interface FakeOptions {
  /** daily_reports'ta bu gün için var olan satır. */
  existing?: Partial<DailyReport> | null
  /** Diğer tabloların satırları. */
  tables?: Record<string, unknown[]>
  /** Koşullu anlatı güncellemesi satıra değdi mi (false: araya AI anlatısı girdi). */
  narrativeUpdateMatches?: boolean
  /** Araya girmiş satır: koşul tutmayınca yeniden okunan. */
  racedRow?: Partial<DailyReport>
}

interface Recorded {
  upserts: Record<string, unknown>[]
  updates: { values: Record<string, unknown>; or: string | null }[]
}

const AI = { source: 'ai', headline: 'AI', went_well: [], postponed: [], suggestion: 's', future_self: 'f' }

function fakeDb(options: FakeOptions = {}): { db: Db; rec: Recorded } {
  const rec: Recorded = { upserts: [], updates: [] }
  let current: Record<string, unknown> | null = options.existing ? { ...options.existing } : null
  let reads = 0

  const from = (table: string) => {
    let op: 'select' | 'upsert' | 'update' = 'select'
    let payload: Record<string, unknown> = {}
    let orFilter: string | null = null

    const rows = (single: boolean): { data: unknown; error: null } => {
      if (table !== 'daily_reports') {
        const data = options.tables?.[table] ?? []
        return { data: single ? (data[0] ?? null) : data, error: null }
      }
      if (op === 'upsert') {
        current = { ...(current ?? { user_id: 'u1', checkin: {}, narrative: null, opened_at: null }), ...payload }
        return { data: current, error: null }
      }
      if (op === 'update') {
        rec.updates.push({ values: payload, or: orFilter })
        if (options.narrativeUpdateMatches === false) return { data: [], error: null }
        current = { ...(current ?? {}), ...payload }
        return { data: [current], error: null }
      }
      reads += 1
      if (reads > 1 && options.racedRow) current = { ...(current ?? {}), ...options.racedRow }
      return { data: current, error: null }
    }

    const chain: Record<string, unknown> = {}
    const self = () => chain
    for (const name of ['select', 'eq', 'gte', 'lte', 'lt', 'gt', 'in', 'not', 'is', 'limit', 'order']) chain[name] = self
    chain['upsert'] = (values: Record<string, unknown>) => { op = 'upsert'; payload = values; rec.upserts.push(values); return chain }
    chain['update'] = (values: Record<string, unknown>) => { op = 'update'; payload = values; return chain }
    chain['or'] = (filter: string) => { orFilter = filter; return chain }
    chain['maybeSingle'] = async () => rows(true)
    chain['single'] = async () => rows(true)
    chain['then'] = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(rows(false)).then(resolve, reject)
    return chain
  }
  return { db: { from } as unknown as Db, rec }
}

const FACTS: DayFacts = {
  date: '2026-10-05', energy: null, items: [], focus_minutes: 0,
  movement: { exercise_minutes: null, steps: null, workout_done: false },
  nutrition: null, habits_week: [], generated_at: '2026-10-05T10:00:00.000Z',
}

const base = { userId: 'u1', timezone: 'Europe/Istanbul', language: 'tr' as const, progress: {} }

// ---------- geçmiş gün ----------

test('geçmiş gün: satır yoksa olgular yeniden kurulmaz, ReportNotFoundError', async () => {
  const { db, rec } = fakeDb({ existing: null })
  await assert.rejects(
    refreshReport(db, { ...base, date: '2026-10-03', today: '2026-10-05' }),
    (error: unknown) => error instanceof ReportNotFoundError && error.date === '2026-10-03',
  )
  assert.equal(rec.upserts.length, 0)
})

test('geçmiş gün: satır varsa tazelenir, bugün için satır yoksa oluşturulur', async () => {
  const past = fakeDb({ existing: { facts: { ...FACTS, date: '2026-10-03' } } })
  await refreshReport(past.db, { ...base, date: '2026-10-03', today: '2026-10-05' })
  assert.equal(past.rec.upserts.length, 1)

  const today = fakeDb({ existing: null })
  await refreshReport(today.db, { ...base, date: '2026-10-05', today: '2026-10-05' })
  assert.equal(today.rec.upserts.length, 1)
})

// ---------- AI anlatısı ve kapanış korunur ----------

test('AI anlatısı varken upsert narrative yazmaz ve şablon güncellemesi hiç denenmez', async () => {
  const { db, rec } = fakeDb({ existing: { facts: FACTS, narrative: AI as DailyReport['narrative'], checkin: {} } })
  const report = await refreshReport(db, { ...base, date: '2026-10-05', today: '2026-10-05' })
  assert.equal('narrative' in (rec.upserts[0] ?? {}), false)
  assert.equal(rec.updates.length, 0)
  assert.equal(report.narrative?.source, 'ai')
})

test('şablon anlatı yalnızca AI olmayan satıra yazılır (koşullu güncelleme)', async () => {
  const { db, rec } = fakeDb({ existing: { facts: FACTS, narrative: null, checkin: {} } })
  const report = await refreshReport(db, { ...base, date: '2026-10-05', today: '2026-10-05' })
  assert.equal('narrative' in (rec.upserts[0] ?? {}), false)
  assert.equal(rec.updates.length, 1)
  assert.match(rec.updates[0]?.or ?? '', /narrative->>source\.neq\.ai/)
  assert.equal(report.narrative?.source, 'template')
})

test('yarış: okuma ile yazma arasında AI anlatısı gelirse şablon ezmez, güncel satır döner', async () => {
  const { db, rec } = fakeDb({
    existing: { facts: FACTS, narrative: null, checkin: {} },
    narrativeUpdateMatches: false,
    racedRow: { narrative: AI as DailyReport['narrative'] },
  })
  const report = await refreshReport(db, { ...base, date: '2026-10-05', today: '2026-10-05' })
  assert.equal(rec.updates.length, 1)
  assert.equal(report.narrative?.source, 'ai')
})

test('cron yolu (checkin verilmedi): upsert checkin ve opened_at yazmaz, mevcut kapanış ezilmez', async () => {
  const checkin = { items: { 'task:a': { outcome: 'skipped' as const } } }
  const { db, rec } = fakeDb({ existing: { facts: FACTS, checkin, opened_at: '2026-10-05T08:00:00.000Z' } })
  await refreshReport(db, { ...base, date: '2026-10-05', today: '2026-10-05' })
  const payload = rec.upserts[0] ?? {}
  assert.equal('checkin' in payload, false)
  assert.equal('opened_at' in payload, false)
})

test('kullanıcı yolu: verilen kapanış yazılır, opened yalnızca ilk açılışta opened_at doldurur', async () => {
  const first = fakeDb({ existing: { facts: FACTS, opened_at: null } })
  await refreshReport(first.db, { ...base, date: '2026-10-05', today: '2026-10-05', checkin: {}, opened: true })
  assert.deepEqual(first.rec.upserts[0]?.['checkin'], {})
  assert.equal(typeof first.rec.upserts[0]?.['opened_at'], 'string')

  const again = fakeDb({ existing: { facts: FACTS, opened_at: '2026-10-05T08:00:00.000Z' } })
  await refreshReport(again.db, { ...base, date: '2026-10-05', today: '2026-10-05', opened: true })
  assert.equal('opened_at' in (again.rec.upserts[0] ?? {}), false)
})

// ---------- istenen tarih ----------

test('istenen tarih: bir gün ilerisi bugüne sıkıştırılır, daha ilerisi ve çok eskisi reddedilir', () => {
  assert.deepEqual(resolveReportDate('2026-10-05', '2026-10-05', 30), { ok: true, date: '2026-10-05' })
  assert.deepEqual(resolveReportDate('2026-10-06', '2026-10-05', 30), { ok: true, date: '2026-10-05' })
  assert.deepEqual(resolveReportDate('2026-10-07', '2026-10-05', 30), { ok: false, reason: 'future' })
  assert.deepEqual(resolveReportDate('2026-09-05', '2026-10-05', 30), { ok: true, date: '2026-09-05' })
  assert.deepEqual(resolveReportDate('2026-09-04', '2026-10-05', 30), { ok: false, reason: 'too_old' })
})

// ---------- akşam bildirimi ----------

const CTX = { seed: 3, weekday: 2 }

test('akşam: beklenen iş de öğün de yoksa bildirim yok (null)', async () => {
  const { db } = fakeDb({ existing: null })
  assert.equal(await buildEveningReport(db, 'u1', '2026-10-05', 'Europe/Istanbul', CTX), null)
})

test('akşam: iş yoksa ama öğün varsa bildirim gider', async () => {
  const { db } = fakeDb({ existing: null, tables: { meals: [{ total_calories: 600, total_protein: 30 }] } })
  const result = await buildEveningReport(db, 'u1', '2026-10-05', 'Europe/Istanbul', CTX)
  assert.ok(result)
  assert.equal(result.reportDate, '2026-10-05')
})

test('akşam: yalnızca manevi iş olan gün (öğün yok) bildirim göndermez', async () => {
  const tasks = [{ id: 't1', title: 'Dua', status: 'done', area: 'spiritual', routine_id: null, estimated_minutes: null, goal: null }]
  const { db } = fakeDb({ existing: null, tables: { tasks } })
  assert.equal(await buildEveningReport(db, 'u1', '2026-10-05', 'Europe/Istanbul', CTX), null)
})
