import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  parseBrainDump,
  sanitizeBrainDumpItems,
  splitBrainDump,
} from '../../packages/shared/src/utils/brainDump.ts'

test('satır, madde işareti, noktalı virgül ve cümle sonundan böler', () => {
  const text = '- faturayı öde\n* annemi ara; kargo takibi\n1. rapor yaz. Spora git!\n\n  '
  assert.deepEqual(splitBrainDump(text), ['faturayı öde', 'annemi ara', 'kargo takibi', 'rapor yaz', 'Spora git'])
})

test('konuşma bağlaçları ayrı görev yapar, saat noktası bölünmez', () => {
  assert.deepEqual(
    splitBrainDump('yarın 15.30 dişçi ve sonra market alışverişi bir de kitap iade'),
    ['yarın 15.30 dişçi', 'market alışverişi', 'kitap iade'],
  )
})

test('ücretsiz yol her parçayı hızlı ekleme ayrıştırıcısından geçirir', () => {
  const out = parseBrainDump('yarın rapor 30dk\nkitap oku', '2026-09-30')
  assert.equal(out.length, 2)
  assert.equal(out[0]?.scheduled_date, '2026-10-01')
  assert.equal(out[0]?.estimated_minutes, 30)
  assert.equal(out[1]?.title, 'kitap oku')
})

test('en fazla 30 parça', () => {
  const text = Array.from({ length: 40 }, (_, i) => `görev ${i}`).join('\n')
  assert.equal(splitBrainDump(text).length, 30)
})

test('AI yanıtı temizlenir: geçersiz alanlar düşer, saatsiz güne saat verilmez', () => {
  const out = sanitizeBrainDumpItems([
    { title: '  Rapor yaz ', scheduled_date: '2026-10-01', start_time: '15:00', estimated_minutes: 45, tags: ['#İş', 3] },
    { title: 'Kargo', scheduled_date: 'yarın', start_time: '25:00', estimated_minutes: 2 },
    { title: 'Saat var gün yok', start_time: '09:00' },
    { title: '' },
    'bozuk',
  ])
  assert.deepEqual(out, [
    { title: 'Rapor yaz', tags: ['iş'], scheduled_date: '2026-10-01', start_time: '15:00', estimated_minutes: 45 },
    { title: 'Kargo', tags: [] },
    { title: 'Saat var gün yok', tags: [] },
  ])
  assert.deepEqual(sanitizeBrainDumpItems({ tasks: [] }), [])
})
