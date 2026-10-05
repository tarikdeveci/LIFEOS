import { test } from 'node:test'
import assert from 'node:assert/strict'

import { applyCheckin, buildTemplateNarrative, summarizeDay } from '../../supabase/functions/_shared/report/narrative.ts'
import { NARRATIVE_TEXT } from '../../supabase/functions/_shared/report/narrativeText.ts'
import type { DayCheckin, DayFacts, DayItem } from '../../supabase/functions/_shared/report/types.ts'

const item = (over: Partial<DayItem> & { key: string }): DayItem => ({
  kind: over.key.startsWith('habit:') ? 'habit' : over.key.startsWith('block:') ? 'block' : 'task',
  title: over.key,
  area: null,
  minutes: null,
  start_time: null,
  expected: true,
  outcome: 'open',
  reason: null,
  program: null,
  untracked: false,
  goal: null,
  ...over,
})

const facts = (items: DayItem[], over: Partial<DayFacts> = {}): DayFacts => ({
  date: '2026-10-07',
  energy: null,
  items,
  focus_minutes: 0,
  movement: { exercise_minutes: null, steps: null, workout_done: false },
  nutrition: null,
  habits_week: [],
  generated_at: '2026-10-07T18:00:00.000Z',
  ...over,
})

const none: DayCheckin = {}

test('applyCheckin: açık öğeye yarım ya da olmadı ve sebep işler', () => {
  const day = facts([item({ key: 'task:a' }), item({ key: 'task:b' }), item({ key: 'task:c' })])
  const out = applyCheckin(day, {
    items: { 'task:a': { outcome: 'partial' }, 'task:b': { outcome: 'skipped', reason: 'energy' } },
  })
  assert.deepEqual(out.items.map((i) => [i.outcome, i.reason]), [['partial', null], ['skipped', 'energy'], ['open', null]])
})

test('applyCheckin: gerçek tamamlama işaretin önüne geçer, bilinmeyen anahtar yok sayılır, girdi değişmez', () => {
  const day = facts([item({ key: 'task:a', outcome: 'done' }), item({ key: 'task:b' })])
  const out = applyCheckin(day, { items: { 'task:a': { outcome: 'skipped', reason: 'time' }, 'task:yok': { outcome: 'partial' } } })
  assert.equal(out.items[0]?.outcome, 'done')
  assert.equal(out.items[0]?.reason, null)
  assert.equal(out.items.length, 2)
  assert.equal(day.items[1]?.outcome, 'open')
  assert.equal(applyCheckin(day, none), day)
})

test('summarizeDay: beklenmeyen öğeler (haftalık esnek, sayaçsız) sayıya girmez', () => {
  const s = summarizeDay(facts([
    item({ key: 'task:a', outcome: 'done' }),
    item({ key: 'task:b', outcome: 'partial' }),
    item({ key: 'task:c', outcome: 'skipped' }),
    item({ key: 'task:d' }),
    item({ key: 'habit:esnek', expected: false, outcome: 'done' }),
  ]))
  assert.deepEqual(s, { total: 4, done: 1, partial: 1, skipped: 1, open: 1 })
})

test('summarizeDay: manevi iş sayılmaz (mobildeki halkayla aynı kural)', () => {
  const s = summarizeDay(facts([
    item({ key: 'task:a', outcome: 'done' }),
    item({ key: 'habit:dua', area: 'spiritual' }),
  ]))
  assert.deepEqual(s, { total: 1, done: 1, partial: 0, skipped: 0, open: 0 })
})

test('şablon anlatı: kaynak template, tüm alanlar dolu, TR ve EN farklı', () => {
  const day = facts([item({ key: 'task:a', title: 'Rapor', outcome: 'done' }), item({ key: 'task:b', title: 'Fatura' })])
  const tr = buildTemplateNarrative(day, none, 'tr')
  const en = buildTemplateNarrative(day, none, 'en')
  assert.equal(tr.source, 'template')
  assert.ok(tr.headline && tr.suggestion && tr.future_self)
  assert.ok(tr.went_well.length > 0)
  assert.notEqual(tr.headline, en.headline)
  assert.match(tr.went_well[0] ?? '', /Rapor/)
  assert.match(en.went_well[0] ?? '', /Rapor/)
})

test('şablon anlatı deterministik: aynı girdi aynı metin, gün değişince havuz döner', () => {
  const at = (date: string) => buildTemplateNarrative(facts([item({ key: 'task:a', outcome: 'done' })], { date }), none, 'tr')
  assert.deepEqual(at('2026-10-07'), at('2026-10-07'))
  const headlines = new Set(['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'].map((d) => at(d).headline))
  assert.ok(headlines.size > 1)
})

test('başlık bandı: hepsi tamam, çoğu tamam, azı tamam, hiç tamam değil, plansız', () => {
  const run = (outcomes: Array<'done' | 'open'>) =>
    buildTemplateNarrative(facts(outcomes.map((outcome, i) => item({ key: `task:${i}`, outcome }))), none, 'tr').headline
  assert.match(run(['done', 'done']), /2\/2|2 iş vardı/)
  assert.match(run(['done', 'done', 'open']), /2\/3/)
  assert.match(run(['done', 'open', 'open']), /1\/3/)
  assert.ok(!/\d\/\d/.test(run(['open', 'open'])))
  assert.ok(NARRATIVE_TEXT.tr.headline.empty.includes(run([])))
})

test('ertelenenler: yalnızca beklenen ve bitmeyen öğeler, sebebe göre suçlamasız not', () => {
  const day = facts([
    item({ key: 'task:a', title: 'Ders', outcome: 'done' }),
    item({ key: 'task:b', title: 'Fatura' }),
    item({ key: 'task:c', title: 'Spor' }),
    item({ key: 'habit:esnek', title: 'Okuma', expected: false }),
  ])
  const narrative = buildTemplateNarrative(day, {
    items: { 'task:b': { outcome: 'skipped', reason: 'energy' }, 'task:c': { outcome: 'partial' } },
  }, 'tr')
  assert.deepEqual(narrative.postponed.map((p) => p.title), ['Fatura', 'Spor'])
  assert.ok(NARRATIVE_TEXT.tr.note.energy.includes(narrative.postponed[0]?.note ?? ''))
  assert.ok(NARRATIVE_TEXT.tr.note.partial.includes(narrative.postponed[1]?.note ?? ''))
})

test('program kaçırılınca sıfırlanmaz: not kaldığı yerden devam eder, ilerleme yazılır', () => {
  const day = facts([item({ key: 'task:a', title: 'Audit eğitimi', program: { done: 7, target: 42 } })])
  const narrative = buildTemplateNarrative(day, { items: { 'task:a': { outcome: 'skipped', reason: 'time' } } }, 'tr')
  assert.match(narrative.postponed[0]?.note ?? '', /7\/42/)
  assert.match(narrative.postponed[0]?.note ?? '', /kaldığın yerden devam/)
})

test('future_self: o gün biten program oturumundan kurulur', () => {
  const day = facts([
    item({ key: 'task:a', title: 'Audit eğitimi', outcome: 'done', area: 'career', program: { done: 8, target: 42 } }),
    item({ key: 'task:b', title: 'Rapor', outcome: 'done', area: 'career' }),
  ])
  const tr = buildTemplateNarrative(day, none, 'tr').future_self
  assert.match(tr, /Audit eğitimi/)
  assert.match(tr, /8\/42/)
  assert.match(buildTemplateNarrative(day, none, 'en').future_self, /8\/42/)
})

test('future_self: program yoksa iş, bakım, odak ve genel cümleye düşer', () => {
  const work = facts([item({ key: 'task:a', title: 'Rapor', outcome: 'done', area: 'career' })])
  assert.match(buildTemplateNarrative(work, none, 'tr').future_self, /Rapor/)
  const care = facts([item({ key: 'habit:a', title: 'Yürüyüş', outcome: 'done', area: 'health', expected: false })])
  assert.match(buildTemplateNarrative(care, none, 'tr').future_self, /Yürüyüş/)
  const focus = facts([], { focus_minutes: 90 })
  assert.match(buildTemplateNarrative(focus, none, 'tr').future_self, /90/)
  assert.ok(NARRATIVE_TEXT.tr.futureSelf.generic.includes(buildTemplateNarrative(facts([]), none, 'tr').future_self))
})

test('iyi giden: hareket, odak ve haftalık alışkanlık somut yazılır, sayaçsız alışkanlıkta sayı yok', () => {
  const day = facts(
    [
      item({ key: 'habit:spor', title: 'Spor', expected: false, outcome: 'done', area: 'health' }),
      item({ key: 'habit:dua', title: 'Dua', expected: false, outcome: 'done', area: 'spiritual' }),
    ],
    {
      focus_minutes: 50,
      movement: { exercise_minutes: 40, steps: 12000, workout_done: false },
      habits_week: [{ routine_id: 'spor', title: 'Spor', area: 'health', done: 2, target: 3 }],
    },
  )
  const wentWell = buildTemplateNarrative(day, none, 'tr').went_well.join('\n')
  assert.match(wentWell, /2\/3/)
  assert.match(wentWell, /40/)
  assert.match(wentWell, /50/)
  const dua = buildTemplateNarrative(day, none, 'tr').went_well.find((l) => l.includes('Dua')) ?? ''
  assert.ok(dua !== '' && !/\d/.test(dua), `sayaçsız alışkanlık satırında sayı olmamalı: ${dua}`)
})

test('sayaçsız rutinin biten görevi anlatıda yalnız adıyla geçer, ertelenenlere girmez', () => {
  const day = facts([
    item({ key: 'task:dua', title: 'Akşam duası', expected: false, outcome: 'done', area: 'spiritual' }),
    item({ key: 'block:namaz', title: 'Cuma namazı', expected: false, area: 'spiritual' }),
  ])
  const narrative = buildTemplateNarrative(day, none, 'tr')
  const line = narrative.went_well.find((l) => l.includes('Akşam duası')) ?? ''
  assert.ok(line !== '' && !/\d/.test(line))
  assert.deepEqual(narrative.postponed, [])
  assert.equal(summarizeDay(day).total, 0)
})

test('iyi giden boşsa tek bir nazik satır döner', () => {
  const narrative = buildTemplateNarrative(facts([item({ key: 'task:a' })]), none, 'tr')
  assert.equal(narrative.went_well.length, 1)
  assert.ok(NARRATIVE_TEXT.tr.wentWell.none.includes(narrative.went_well[0] ?? ''))
})

test('öneri: sebebe ve enerjiye göre seçilir', () => {
  const suggest = (reason: 'energy' | 'avoided' | 'interrupted' | 'time', energy: number | null = null) =>
    buildTemplateNarrative(facts([item({ key: 'task:a' })], { energy }), { items: { 'task:a': { outcome: 'skipped', reason } } }, 'tr').suggestion
  assert.ok(NARRATIVE_TEXT.tr.suggestion.avoided.includes(suggest('avoided')))
  assert.ok(NARRATIVE_TEXT.tr.suggestion.energy.includes(suggest('energy')))
  assert.ok(NARRATIVE_TEXT.tr.suggestion.interrupted.includes(suggest('interrupted')))
  assert.ok(NARRATIVE_TEXT.tr.suggestion.time.includes(suggest('time')))
  const lowEnergyDay = buildTemplateNarrative(facts([item({ key: 'task:a' })], { energy: 1 }), none, 'tr').suggestion
  assert.ok(NARRATIVE_TEXT.tr.suggestion.energy.includes(lowEnergyDay))
  const allDone = buildTemplateNarrative(facts([item({ key: 'task:a', outcome: 'done' })]), none, 'tr').suggestion
  assert.ok(NARRATIVE_TEXT.tr.suggestion.steady.includes(allDone))
})

test('uzun postponed listesi kısaltılır', () => {
  const many = Array.from({ length: 9 }, (_, i) => item({ key: `task:${i}` }))
  assert.equal(buildTemplateNarrative(facts(many), none, 'tr').postponed.length, 5)
})

function allStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(allStrings)
  if (value && typeof value === 'object') return Object.values(value).flatMap(allStrings)
  return []
}

test('metin havuzları: uzun ve orta tire yok, sayıdan ya da yer tutucudan sonra ek yok', () => {
  const texts = allStrings(NARRATIVE_TEXT)
  assert.ok(texts.length > 100)
  for (const text of texts) {
    assert.ok(!/[\u2013\u2014]/.test(text), `tire var: ${text}`)
    assert.ok(!/[\d}]'[\p{L}]/u.test(text), `sayıdan sonra ek var: ${text}`)
  }
})

test('future_self: hedefe bağlı biten iş hedefi anar (TR ve EN), ölçülmeyen iş saymaz', () => {
  const goal = { id: 'g1', title: 'Sertifika' }
  const day = facts([
    item({ key: 'task:a', title: 'Rapor', outcome: 'done', area: 'career' }),
    item({ key: 'task:b', title: 'Modül 3', outcome: 'done', area: 'career', goal }),
  ])
  assert.match(buildTemplateNarrative(day, none, 'tr').future_self, /Sertifika/)
  assert.match(buildTemplateNarrative(day, none, 'en').future_self, /Sertifika/)
  const quiet = facts([item({ key: 'task:c', title: 'Dua', outcome: 'done', untracked: true, goal })])
  assert.doesNotMatch(buildTemplateNarrative(quiet, none, 'tr').future_self, /Sertifika/)
})

test('summarizeDay: ölçülmeyen (untracked) iş sayıya girmez', () => {
  const s = summarizeDay(facts([
    item({ key: 'task:a', outcome: 'done' }),
    item({ key: 'task:b', outcome: 'open', untracked: true }),
  ]))
  assert.deepEqual(s, { total: 1, done: 1, partial: 0, skipped: 0, open: 0 })
})

test('şablon anlatı: açık manevi ve ölçülmeyen iş ertelenen sayılmaz, öneri eşiğini tetiklemez', () => {
  const day = facts([
    item({ key: 'task:a', outcome: 'done' }),
    item({ key: 'task:dua', area: 'spiritual' }),
    item({ key: 'habit:z', untracked: true }),
    item({ key: 'task:namaz', area: 'spiritual' }),
  ])
  const narrative = buildTemplateNarrative(day, none, 'tr')
  assert.deepEqual(narrative.postponed, [])
  // Sayılan tek iş yapıldı: öneri "kalan var" ya da "zaman" havuzundan gelmemeli.
  assert.ok(NARRATIVE_TEXT.tr.suggestion.steady.includes(narrative.suggestion))
})

test('şablon anlatı: yalnızca manevi iş olan gün sakin gün önerisi alır', () => {
  const narrative = buildTemplateNarrative(facts([item({ key: 'task:dua', area: 'spiritual', outcome: 'done' })]), none, 'tr')
  assert.ok(NARRATIVE_TEXT.tr.suggestion.empty.includes(narrative.suggestion))
})
