import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildDailyReportPrompt,
  isCalendarDate,
  isUnmeasured,
  parseDailyReportNarrative,
  readReportContext,
  readStoredAiNarrative,
  type ReportContext,
} from '../../supabase/functions/_shared/ai/dailyReport.ts'

const item = (over: Record<string, unknown>) => ({
  key: 'task:1', kind: 'task', title: 'Görev', area: null, minutes: null,
  start_time: null, expected: true, outcome: 'open', reason: null, program: null, untracked: false, goal: null, ...over,
})

const FACTS = {
  date: '2026-10-05',
  energy: 2,
  items: [
    item({ key: 'task:a', title: 'Audit eğitimi', area: 'career', minutes: 60, outcome: 'done', program: { done: 7, target: 42 } }),
    item({ key: 'task:b', title: 'İş başvurusu', area: 'career', minutes: 90, outcome: 'open' }),
    item({ key: 'block:c', title: 'Spor', area: 'health', minutes: 45, outcome: 'open' }),
    item({ key: 'block:d', title: 'Cuma namazı', area: 'spiritual', minutes: 40, outcome: 'done' }),
    item({ key: 'habit:e', title: 'Dua', area: 'spiritual', minutes: 10, outcome: 'open' }),
    item({ key: 'habit:f', title: 'Okuma', area: 'personal', expected: false, outcome: 'open' }),
  ],
  focus_minutes: 95,
  movement: { exercise_minutes: null, steps: 4200, workout_done: false },
  nutrition: { calories: 1800, calorie_target: 2200, protein_g: 110, meals: 3 },
  habits_week: [{ routine_id: 'r1', title: 'Spor', area: 'health', done: 2, target: 3 }],
}

const CHECKIN = {
  items: {
    'task:b': { outcome: 'skipped', reason: 'energy' },
    'block:c': { outcome: 'partial', reason: 'time' },
    'task:a': { outcome: 'skipped' },
  },
  note: 'Zor bir gündü.',
}

function context(): ReportContext {
  const ctx = readReportContext(FACTS, CHECKIN)
  assert.ok(ctx)
  return ctx
}

// ---------- readReportContext ----------

test('olgular: kapanış işareti açık işi günceller, tamamlanmış işin önüne geçmez', () => {
  const byKey = new Map(context().items.map((i) => [i.key, i]))
  assert.equal(byKey.get('task:b')?.outcome, 'skipped')
  assert.equal(byKey.get('task:b')?.reason, 'energy')
  assert.equal(byKey.get('block:c')?.outcome, 'partial')
  assert.equal(byKey.get('block:c')?.reason, 'time')
  // "Yaptım" gerçek tamamlamadır; checkin onu "olmadı"ya çeviremez.
  assert.equal(byKey.get('task:a')?.outcome, 'done')
  assert.deepEqual(byKey.get('task:a')?.program, { done: 7, target: 42 })
  assert.equal(byKey.get('habit:f')?.expected, false)
})

test('olgular: öğe listesi yoksa ya da bozuksa null, eksik alanlar çökmez', () => {
  assert.equal(readReportContext({}, {}), null)
  assert.equal(readReportContext(null, null), null)
  assert.equal(readReportContext({ items: 'x' }, {}), null)
  const sparse = readReportContext({ items: [null, 5, { title: '' }, { title: 'Yalın', outcome: 'bilinmeyen' }] }, 'bozuk')
  assert.equal(sparse?.items.length, 1)
  assert.equal(sparse?.items[0]?.outcome, 'open')
  assert.equal(sparse?.focusMinutes, 0)
  assert.equal(sparse?.nutrition, null)
})

// ---------- buildDailyReportPrompt ----------

const promptOf = (ctx: ReportContext, about = '') => buildDailyReportPrompt({ lang: 'tr', context: ctx, about })
const volatileOf = (ctx: ReportContext, about = '') => promptOf(ctx, about).system[1]?.text ?? ''

test('prompt: gerçek iş adları, sebepler ve program ilerlemesi verilir', () => {
  const text = volatileOf(context())
  assert.match(text, /"Audit eğitimi" \(career, 60 dk, program 7\/42\)/)
  assert.match(text, /"İş başvurusu" \(career, 90 dk\): yapılmadı, sebep: enerjisi düşüktü/)
  assert.match(text, /"Spor" \(health, 45 dk\): yarım kaldı, sebep: zaman yetmedi/)
  assert.match(text, /enerji 2\/5/)
  assert.match(text, /KULLANICININ GÜN NOTU\nZor bir gündü\./)
  assert.match(text, /BU HAFTA ALIŞKANLIKLAR\n- Spor: 2\/3/)
})

test('prompt: bekleniyordu olmayan esnek alışkanlık kaçan iş sayılmaz', () => {
  assert.doesNotMatch(volatileOf(context()), /Okuma/)
})

test('prompt: manevi işin süresi ve sayacı verilmez, yapılmayanı hiç anılmaz', () => {
  const text = volatileOf(context())
  assert.match(text, /ÖLÇÜLMEYEN İŞLER[^\n]*YASAK\)\n"Cuma namazı"/)
  assert.doesNotMatch(text, /40 dk/)
  assert.doesNotMatch(text, /Dua/)
})

test('prompt: about notu etiketli bloğa girer, boşsa yazılmaz; sabit kısım kullanıcıdan bağımsız', () => {
  const withAbout = volatileOf(context(), 'Seri bozulması başarısızlık değil.')
  assert.match(withAbout, /<not>\nSeri bozulması başarısızlık değil\.\n<\/not>/)
  assert.doesNotMatch(volatileOf(context()), /KENDİ NOTU/)

  const other = readReportContext({ ...FACTS, date: '2026-01-01', items: [] }, {})
  assert.ok(other)
  assert.equal(promptOf(context(), 'a').system[0]?.text, promptOf(other, 'b').system[0]?.text)
})

test('prompt: ton kuralları ve dil, uzun ve orta tire yok', () => {
  const { system } = promptOf(context())
  const stable = system[0]?.text ?? ''
  assert.match(stable, /kaçan iş başarısızlık değildir/)
  assert.match(stable, /TEK somut öneri/)
  assert.match(stable, /sayı, süre, yüzde, seri, performans ya da verimlilik dili ASLA/)
  assert.doesNotMatch(JSON.stringify(promptOf(context(), 'not')), /[\u2013\u2014]/)
  const en = buildDailyReportPrompt({ lang: 'en', context: context(), about: '' }).system[1]?.text ?? ''
  assert.match(en, /Write in English/)
})

// ---------- parseDailyReportNarrative ----------

const narrativeJson = (over: Record<string, unknown> = {}) => JSON.stringify({
  headline: 'Audit eğitimini yaptın, gün düşük enerjiyle geçti.',
  went_well: ['Audit eğitimi 7/42 oldu.', 'Cuma namazına zaman ayırdın.'],
  postponed: [
    { title: 'iş başvurusu', note: 'Enerji düşüktü.' },
    { title: 'Spor', note: 'Zaman yetmedi, yarım kaldı.' },
  ],
  suggestion: 'Yarın iş başvurusunu sabaha al.',
  future_self: 'Audit eğitiminde bir adım ilerledin.',
  ...over,
})

test('anlatı: geçerli çıktı source ai ile döner, başlıklar gerçek iş adına çevrilir', () => {
  const narrative = parseDailyReportNarrative(narrativeJson(), context().items)
  assert.deepEqual(narrative, {
    source: 'ai',
    headline: 'Audit eğitimini yaptın, gün düşük enerjiyle geçti.',
    went_well: ['Audit eğitimi 7/42 oldu.', 'Cuma namazına zaman ayırdın.'],
    postponed: [
      { title: 'İş başvurusu', note: 'Enerji düşüktü.' },
      { title: 'Spor', note: 'Zaman yetmedi, yarım kaldı.' },
    ],
    suggestion: 'Yarın iş başvurusunu sabaha al.',
    future_self: 'Audit eğitiminde bir adım ilerledin.',
  })
})

test('anlatı: zorunlu alan eksikse ya da JSON yoksa null', () => {
  const items = context().items
  assert.equal(parseDailyReportNarrative('Üzgünüm.', items), null)
  assert.equal(parseDailyReportNarrative(narrativeJson({ headline: '  ' }), items), null)
  assert.equal(parseDailyReportNarrative(narrativeJson({ suggestion: undefined }), items), null)
  assert.equal(parseDailyReportNarrative(narrativeJson({ future_self: 5 }), items), null)
})

test('anlatı: postponed yalnızca gerçekten yapılmamış, bekleniyordu ve ölçülmeyen olmayan işlere kalır', () => {
  const narrative = parseDailyReportNarrative(narrativeJson({
    postponed: [
      { title: 'Audit eğitimi', note: 'zaten yapıldı' },
      { title: 'Uydurma iş', note: 'yok' },
      { title: 'Dua', note: 'manevi' },
      { title: 'Cuma namazı', note: 'manevi' },
      { title: 'Okuma', note: 'esnek' },
      { title: 'SPOR', note: 'ilk' },
      { title: 'Spor', note: 'tekrar' },
    ],
  }), context().items)
  assert.deepEqual(narrative?.postponed, [{ title: 'Spor', note: 'ilk' }])
})

test('anlatı: caplar uygulanır', () => {
  const items = readReportContext({
    items: Array.from({ length: 8 }, (_, i) => item({ key: `task:${i}`, title: `İş numarası ${i}`, outcome: 'open' })),
  }, {})?.items ?? []
  const narrative = parseDailyReportNarrative(narrativeJson({
    headline: 'h'.repeat(400),
    went_well: ['a', 'b', 'c', 'd', 'e', '', 7],
    postponed: items.map((i) => ({ title: i.title, note: 'n'.repeat(400) })),
    suggestion: 's'.repeat(600),
  }), items)
  assert.equal(narrative?.headline.length, 160)
  assert.deepEqual(narrative?.went_well, ['a', 'b', 'c'])
  assert.equal(narrative?.postponed.length, 5)
  assert.equal(narrative?.postponed[0]?.note.length, 200)
  assert.equal(narrative?.suggestion.length, 300)
})

test('anlatı: manevi işe sayı bağlayan madde düşer, başlıktaki sayı ihlal sayılmaz', () => {
  const items = context().items
  const dropped = parseDailyReportNarrative(narrativeJson({
    went_well: ['Cuma namazı 40 dakika sürdü.', 'Cuma namazı %100 tamamlandı.', 'Cuma namazına zaman ayırdın.', 'Audit eğitimi 7/42 oldu.'],
  }), items)
  assert.deepEqual(dropped?.went_well, ['Cuma namazına zaman ayırdın.', 'Audit eğitimi 7/42 oldu.'])

  const numbered = [...items, ...(readReportContext({ items: [item({ title: '5 dk dua', area: 'spiritual', outcome: 'done' })] }, {})?.items ?? [])]
  const ok = parseDailyReportNarrative(narrativeJson({ went_well: ['5 dk dua için yer açtın.'] }), numbered)
  assert.deepEqual(ok?.went_well, ['5 dk dua için yer açtın.'])
  const bad = parseDailyReportNarrative(narrativeJson({ went_well: ['5 dk dua 3 gün üst üste yapıldı.'] }), numbered)
  assert.deepEqual(bad?.went_well, [])
})

test('anlatı: başlık, öneri ya da gelecek cümlesi manevi işe sayı bağlıyorsa tümü reddedilir', () => {
  const items = context().items
  assert.equal(parseDailyReportNarrative(narrativeJson({ headline: 'Cuma namazı dahil 3 işi bitirdin.' }), items), null)
  assert.equal(parseDailyReportNarrative(narrativeJson({ future_self: 'Cuma namazını 5 günlük seriye taşıdın.' }), items), null)
  assert.equal(parseDailyReportNarrative(narrativeJson({ suggestion: 'Yarın 3 işe odaklan.' }), items)?.source, 'ai')
})

// ---------- readStoredAiNarrative ----------

test('saklanan anlatı: yalnızca sağlam ai anlatısı döner', () => {
  const stored = { source: 'ai', headline: 'H', went_well: ['a'], postponed: [{ title: 'T', note: 'n' }], suggestion: 'S', future_self: 'F' }
  assert.deepEqual(readStoredAiNarrative(stored), stored)

  assert.equal(readStoredAiNarrative({ ...stored, source: 'template' }), null)
  assert.equal(readStoredAiNarrative({ ...stored, headline: '' }), null)
  assert.equal(readStoredAiNarrative(null), null)
  assert.equal(readStoredAiNarrative('ai'), null)
  assert.deepEqual(readStoredAiNarrative({ ...stored, went_well: 'x', postponed: [null, { title: '' }] })?.postponed, [])
})

// ---------- isCalendarDate ----------

test('tarih: takvimde olmayan gün reddedilir', () => {
  assert.equal(isCalendarDate('2026-10-05'), true)
  assert.equal(isCalendarDate('2024-02-29'), true)
  assert.equal(isCalendarDate('2026-02-31'), false)
  assert.equal(isCalendarDate('2026-13-01'), false)
  assert.equal(isCalendarDate('05.10.2026'), false)
  assert.equal(isCalendarDate(undefined), false)
  assert.equal(isCalendarDate(20261005), false)
})

test('isUnmeasured: manevi alan ya da untracked bayrağı yeter, eski kayıtta bayrak yoksa ölçülür', () => {
  const read = (over: Record<string, unknown>) => readReportContext({ items: [item({ title: 'Is', ...over })] }, {})?.items[0]
  const quiet = read({ untracked: true })
  const dini = read({ area: 'spiritual' })
  const plain = read({})
  const legacy = readReportContext({ items: [{ key: 'task:1', title: 'Eski', outcome: 'done' }] }, {})?.items[0]
  assert.ok(quiet && dini && plain && legacy)
  assert.equal(isUnmeasured(quiet), true)
  assert.equal(isUnmeasured(dini), true)
  assert.equal(isUnmeasured(plain), false)
  assert.equal(isUnmeasured(legacy), false)
})
