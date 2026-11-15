import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  AI_TIP_LOG_KIND,
  aiTipAudience,
  loadAiTipFacts,
  type AiTipDb,
  type AiTipFacts,
} from '../../supabase/functions/daily-digest/aiTip.ts'
import { aiTipLine, dayContext, withAiTip } from '../../supabase/functions/daily-digest/copy.ts'

const UID = '3f2b8c1e-0a4d-4c52-9f6e-1d2a3b4c5d6e'
const TODAY = '2026-11-15'
const facts = (over: Partial<AiTipFacts> = {}): AiTipFacts => ({ hasAiPlan: false, aiUsed30d: 0, lastTipDate: null, ...over })

test('AI satırı: AI\'ı hiç denememiş ücretsiz kullanıcı "new" kitlesidir', () => {
  assert.equal(aiTipAudience(facts(), TODAY), 'new')
})

test('AI satırı: az kullanmış (1 ya da 2) kullanıcı "tried" kitlesidir', () => {
  assert.equal(aiTipAudience(facts({ aiUsed30d: 1 }), TODAY), 'tried')
  assert.equal(aiTipAudience(facts({ aiUsed30d: 2 }), TODAY), 'tried')
})

test('AI satırı: sık kullanan, Pro ya da deneme kullanıcısına gitmez', () => {
  assert.equal(aiTipAudience(facts({ aiUsed30d: 3 }), TODAY), null)
  assert.equal(aiTipAudience(facts({ aiUsed30d: 40 }), TODAY), null)
  assert.equal(aiTipAudience(facts({ hasAiPlan: true }), TODAY), null)
})

test('AI satırı: haftada en çok bir kez (yerel gün farkı 7)', () => {
  assert.equal(aiTipAudience(facts({ lastTipDate: '2026-11-15' }), TODAY), null)
  assert.equal(aiTipAudience(facts({ lastTipDate: '2026-11-09' }), TODAY), null)
  assert.equal(aiTipAudience(facts({ lastTipDate: '2026-11-08' }), TODAY), 'new')
  assert.equal(aiTipAudience(facts({ lastTipDate: '2026-10-01' }), TODAY), 'new')
})

test('AI satırı: ay sınırını aşan gün farkı doğru sayılır', () => {
  assert.equal(aiTipAudience(facts({ lastTipDate: '2026-10-31' }), '2026-11-06'), null)
  assert.equal(aiTipAudience(facts({ lastTipDate: '2026-10-31' }), '2026-11-07'), 'new')
})

test('AI satırı metni: her gün döner, uzun tire içermez, sayıdan sonra ek yok', () => {
  const days = Array.from({ length: 8 }, (_, i) => `2026-11-${String(10 + i).padStart(2, '0')}`)
  for (const audience of ['new', 'tried'] as const) {
    const texts = days.map((d) => aiTipLine(audience, dayContext(UID, d)))
    assert.ok(new Set(texts).size >= 3, `${audience} havuzu dönmüyor`)
    for (const t of texts) {
      assert.ok(t.length > 0 && t.length <= 140, t)
      assert.ok(!new RegExp(String.fromCharCode(91, 0x2013, 0x2014, 93)).test(t), t)
    }
  }
})

test('AI satırı metni: "ücretsiz" yalnız denememiş kitleye söylenir', () => {
  const days = Array.from({ length: 8 }, (_, i) => `2026-11-${String(10 + i).padStart(2, '0')}`)
  for (const d of days) {
    assert.match(aiTipLine('new', dayContext(UID, d)), /ücretsiz/)
    assert.doesNotMatch(aiTipLine('tried', dayContext(UID, d)), /ücretsiz/)
  }
})

test('withAiTip: başlık aynı kalır, satır gövdenin sonuna eklenir', () => {
  const ctx = dayContext(UID, TODAY)
  const out = withAiTip({ title: 'Günaydın', body: 'Bugün 3 işin var.' }, 'new', ctx)
  assert.equal(out.title, 'Günaydın')
  assert.ok(out.body.startsWith('Bugün 3 işin var.'))
  assert.ok(out.body.endsWith(aiTipLine('new', ctx)))
})

// supabase-js zincirini taklit eden sahte istemci: tablo başına sabit yanıt döner.
function fakeDb(tables: Record<string, { data?: Record<string, unknown>[]; count?: number; error?: string }>, seen: string[] = []): AiTipDb {
  const query = (table: string) => {
    const reply = tables[table] ?? { data: [] }
    const q: Record<string, unknown> = {
      eq: (col: string, val: unknown) => { seen.push(`${table}.${col}=${String(val)}`); return q },
      gte: () => q,
      order: () => q,
      limit: () => q,
      then: (resolve: (v: unknown) => unknown) =>
        resolve({ data: reply.data ?? null, count: reply.count ?? null, error: reply.error ? { message: reply.error } : null }),
    }
    return q
  }
  return { from: (table: string) => ({ select: () => query(table) }) } as unknown as AiTipDb
}

const NOW = new Date('2026-11-15T10:00:00Z')

test('loadAiTipFacts: aktif Pro ve deneme "hasAiPlan" sayılır, süresi dolmuş Pro sayılmaz', async () => {
  const pro = await loadAiTipFacts(fakeDb({ subscriptions: { data: [{ status: 'pro_monthly', current_period_end: '2026-12-01T00:00:00Z', period_type: 'normal' }] } }), UID, NOW)
  assert.equal(pro.hasAiPlan, true)
  const expired = await loadAiTipFacts(fakeDb({ subscriptions: { data: [{ status: 'pro_annual', current_period_end: '2026-11-01T00:00:00Z', period_type: 'normal' }] } }), UID, NOW)
  assert.equal(expired.hasAiPlan, false)
  const trial = await loadAiTipFacts(fakeDb({ subscriptions: { data: [{ status: 'free', current_period_end: null, period_type: 'trial' }] } }), UID, NOW)
  assert.equal(trial.hasAiPlan, true)
  const none = await loadAiTipFacts(fakeDb({}), UID, NOW)
  assert.equal(none.hasAiPlan, false)
})

test('loadAiTipFacts: ai_used sayısını ve son satır gününü notification_log kaydından okur', async () => {
  const seen: string[] = []
  const out = await loadAiTipFacts(fakeDb({
    events: { count: 2 },
    notification_log: { data: [{ local_date: '2026-11-10' }] },
  }, seen), UID, NOW)
  assert.deepEqual(out, { hasAiPlan: false, aiUsed30d: 2, lastTipDate: '2026-11-10' })
  assert.ok(seen.includes('events.name=ai_used'))
  assert.ok(seen.includes(`notification_log.kind=${AI_TIP_LOG_KIND}`))
})

test('loadAiTipFacts: sorgu hatası fırlatılır (çağıran satırı atlar)', async () => {
  for (const table of ['subscriptions', 'events', 'notification_log']) {
    await assert.rejects(loadAiTipFacts(fakeDb({ [table]: { error: 'boom' } }), UID, NOW), /boom/)
  }
})
