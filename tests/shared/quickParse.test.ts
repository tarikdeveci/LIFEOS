import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseQuickTask } from '../../packages/shared/src/utils/quickParse.ts'

// 2026-09-29 salı
const TODAY = '2026-09-29'
const p = (s: string) => parseQuickTask(s, TODAY)

test('yarın + saat + süre', () => {
  const r = p('yarın 15:00 rapor 30dk')
  assert.equal(r.title, 'rapor')
  assert.equal(r.scheduled_date, '2026-09-30')
  assert.equal(r.start_time, '15:00')
  assert.equal(r.estimated_minutes, 30)
})

test('gün adı ve gün bölümü', () => {
  const r = p('cuma akşam annemi ara')
  assert.equal(r.title, 'annemi ara')
  assert.equal(r.scheduled_date, '2026-10-02')
  assert.equal(r.start_time, '19:00')
})

test('haftaya salı: gelecek haftanın salısı', () => {
  const r = p('haftaya salı sunum')
  assert.equal(r.title, 'sunum')
  assert.equal(r.scheduled_date, '2026-10-06')
})

test('bugünün adı bugün demek; cumartesi cuma ile karışmaz', () => {
  assert.equal(p('salı spor').scheduled_date, '2026-09-29')
  assert.equal(p('cumartesi pazar alışverişi').scheduled_date, '2026-10-03')
  assert.equal(p('pazartesi toplantı').scheduled_date, '2026-10-05')
})

test('"kadar" son tarih olur, yönelme eki tanınır', () => {
  const r = p('cumaya kadar teklif gönder')
  assert.equal(r.title, 'teklif gönder')
  assert.equal(r.due_date, '2026-10-02')
  assert.equal(r.scheduled_date, undefined)
  assert.equal(p("cuma'ya kadar rapor").due_date, '2026-10-02')
  assert.equal(p('15 ekime kadar vize').due_date, '2026-10-15')
})

test('ay adıyla ve noktalı tarih; geçmişte kalan tarih gelecek yıla', () => {
  assert.equal(p('15 ekim diş hekimi').scheduled_date, '2026-10-15')
  assert.equal(p('3 mart vergi').scheduled_date, '2027-03-03')
  assert.equal(p('20.11 doğum günü').scheduled_date, '2026-11-20')
  assert.equal(p('31 şubat olmaz').scheduled_date, undefined)
})

test('göreli günler', () => {
  assert.equal(p('3 gün sonra kontrol').scheduled_date, '2026-10-02')
  assert.equal(p('2 hafta sonra tekrar').scheduled_date, '2026-10-13')
  assert.equal(p('öbür gün kargo').scheduled_date, '2026-10-01')
  assert.equal(p('hafta sonu temizlik').scheduled_date, '2026-10-03')
  assert.equal(p('ay sonu kira').scheduled_date, '2026-09-30')
  assert.equal(p('gelecek hafta planla').scheduled_date, '2026-10-05')
})

test('saat biçimleri', () => {
  assert.equal(p("toplantı saat 3").start_time, '15:00')
  assert.equal(p("yarın 10'da berber").start_time, '10:00')
  assert.equal(p('öğlen 1 yemek').start_time, '13:00')
  assert.equal(p('gece 11 yedek al').start_time, '23:00')
  assert.equal(p('sabah 9 koşu').start_time, '09:00')
  // Saat verilip gün verilmezse bugün.
  assert.equal(p('14:30 arama').scheduled_date, TODAY)
})

test('belirsiz kelimeler başlıkta kalır', () => {
  const r = p('akşam yemeği hazırla')
  assert.equal(r.title, 'akşam yemeği hazırla')
  assert.equal(r.start_time, undefined)
  assert.equal(p('3 kitap oku').title, '3 kitap oku')
  assert.equal(p('3 kitap oku').scheduled_date, undefined)
})

test('süre biçimleri', () => {
  assert.equal(p('rapor 1,5 saat').estimated_minutes, 90)
  assert.equal(p('rapor 2 sa').estimated_minutes, 120)
  assert.equal(p('mail 10 dakika').estimated_minutes, 10)
})

test('eski kısayollar çalışmaya devam eder', () => {
  const r = p('teklif #iş #satış !4 @yarın >2026-10-10')
  assert.equal(r.title, 'teklif')
  assert.deepEqual(r.tags, ['iş', 'satış'])
  assert.equal(r.effort_score, 4)
  assert.equal(r.scheduled_date, '2026-09-30')
  assert.equal(r.due_date, '2026-10-10')
})

test('büyük harf ve Türkçe karakter', () => {
  const r = p('YARIN Akşam İlaç al')
  assert.equal(r.title, 'İlaç al')
  assert.equal(r.scheduled_date, '2026-09-30')
  assert.equal(r.start_time, '19:00')
})
