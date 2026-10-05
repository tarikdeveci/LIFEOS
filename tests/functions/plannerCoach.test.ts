import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPlannerPrompt,
  parsePlannerResult,
  routineBlockContext,
  type PlannerInput,
  type ProtectedBlock,
} from '../../supabase/functions/_shared/ai/planner.ts'
import { parsePlanningRules } from '../../supabase/functions/_shared/ai/planningRules.ts'

const PROTECTED: ProtectedBlock[] = [
  { id: 'blk-spor', start: '07:00', end: '08:00', label: 'Spor' },
]

function input(overrides: Partial<PlannerInput> = {}): PlannerInput {
  return {
    lang: 'tr',
    targetDate: '2026-10-05',
    today: '2026-10-05',
    now: '09:00',
    planningCutoff: '09:00',
    energyLevel: 4,
    bufferMinutes: 15,
    maxDeepTasks: 3,
    rollover: 'carry',
    about: '',
    protectedBlocks: [],
    minVersions: [],
    pastBlocks: [],
    futureBlocks: [{ id: 'blk-1', start: '10:00', end: '11:00', label: 'Odak' }],
    scheduledTasks: [],
    backlogTasks: [],
    history: [],
    userMessage: 'Günümü planla',
    ...overrides,
  }
}

const volatileOf = (i: PlannerInput): string => buildPlannerPrompt(i).system[1]?.text ?? ''
const stableOf = (i: PlannerInput): string => buildPlannerPrompt(i).system[0]?.text ?? ''

// ---------- parsePlanningRules ----------

test('kurallar: yalnızca geçerli alanlar gelir, sınırlar uygulanır', () => {
  assert.deepEqual(parsePlanningRules(undefined), {})
  assert.deepEqual(parsePlanningRules('x'), {})
  assert.deepEqual(parsePlanningRules({ max_deep_tasks: 9, buffer_minutes: -4, rollover: 'backlog', about: '  not  ' }), {
    max_deep_tasks: 5,
    buffer_minutes: 0,
    rollover: 'backlog',
    about: 'not',
  })
  // Geçersiz tip ve enum düşer; boş about hiç yazılmaz.
  assert.deepEqual(parsePlanningRules({ max_deep_tasks: '3', rollover: 'hepsi', about: '   ' }), {})
})

test('kurallar: about en çok 2000 karakter, vekil çifti bölünmez', () => {
  const rules = parsePlanningRules({ about: 'a'.repeat(2500) })
  assert.equal(rules.about?.length, 2000)
  const emoji = parsePlanningRules({ about: '😀'.repeat(2100) })
  assert.equal(Array.from(emoji.about ?? '').length, 2000)
})

// ---------- routineBlockContext ----------

test('rutin bağlamı: korumalı bloklar ve kısaltılabilir bloklar ayrışır', () => {
  const blocks = [
    { id: 'b1', routine_id: 'r-spor', label: 'Spor', start_time: '07:00:00', end_time: '08:00:00' },
    { id: 'b2', routine_id: 'r-audit', label: 'Audit eğitimi', start_time: '14:00:00', end_time: '15:00:00' },
    { id: 'b3', routine_id: 'r-yok', label: 'Başka', start_time: '16:00:00', end_time: '17:00:00' },
    { id: 'b4', routine_id: null, label: 'Rutinsiz', start_time: '18:00:00', end_time: '19:00:00' },
    { id: 'b5', routine_id: 'r-audit', label: 'Audit (geçmiş)', start_time: '06:00:00', end_time: '06:45:00' },
  ]
  const routines = [
    { id: 'r-spor', is_protected: true, min_minutes: 20 },
    { id: 'r-audit', is_protected: false, min_minutes: 20 },
  ]
  const ctx = routineBlockContext(blocks, routines, '09:00')

  assert.deepEqual(ctx.protectedBlocks, [{ id: 'b1', start: '07:00', end: '08:00', label: 'Spor' }])
  // b1 korumalı ve 60 dk > 20 dk ama 08:00 < 09:00 (geçmiş): asgari sürümü yok. b2 gelecekte.
  assert.deepEqual(ctx.minVersions, [
    { id: 'b2', label: 'Audit eğitimi', minutes: 60, min_minutes: 20, protected: false },
  ])
})

test('rutin bağlamı: asgari süre bloktan uzun ya da eşitse kısaltılacak bir şey yok', () => {
  const ctx = routineBlockContext(
    [{ id: 'b1', routine_id: 'r', label: 'X', start_time: '10:00', end_time: '10:30' }],
    [{ id: 'r', is_protected: false, min_minutes: 30 }],
    '00:00',
  )
  assert.deepEqual(ctx.minVersions, [])
})

test('rutin bağlamı: korumalı blok geçmişte olsa da dokunulmaz kümesinde kalır', () => {
  const ctx = routineBlockContext(
    [{ id: 'b1', routine_id: 'r', label: null, start_time: '07:00:00', end_time: '08:00:00' }],
    [{ id: 'r', is_protected: true, min_minutes: null }],
    '23:00',
  )
  assert.equal(ctx.protectedBlocks.length, 1)
  assert.equal(ctx.protectedBlocks[0]?.label, '')
})

// ---------- buildPlannerPrompt ----------

test('prompt: kurallar bölümü tavanı ve rollover satırını taşır', () => {
  const text = volatileOf(input({ maxDeepTasks: 2, rollover: 'backlog' }))
  assert.match(text, /KULLANICININ KURALLARI/)
  assert.match(text, /Günde en çok 2 önemli zihinsel iş/)
  assert.match(text, /ertesi güne taşıma/)
  assert.doesNotMatch(volatileOf(input({ rollover: 'carry' })), /ertesi güne taşıma/)
})

test('prompt: about notu etiketli bloğa girer, boşsa hiç yazılmaz', () => {
  const withAbout = volatileOf(input({ about: 'Kaçan iş başarısızlık değil.' }))
  assert.match(withAbout, /KULLANICININ KENDİ NOTU/)
  assert.match(withAbout, /<not>\nKaçan iş başarısızlık değil\.\n<\/not>/)
  assert.doesNotMatch(volatileOf(input()), /KULLANICININ KENDİ NOTU/)
})

test('prompt: korumalı bloklar id ile listelenir ve taşıma/silme uyarısı taşır', () => {
  const text = volatileOf(input({ protectedBlocks: PROTECTED }))
  assert.match(text, /KORUMALI BLOKLAR \(taşıma, silme\)\n- id: blk-spor \| 07:00-08:00 \| Spor/)
  assert.doesNotMatch(volatileOf(input()), /KORUMALI BLOKLAR/)
})

test('prompt: asgari sürümler yalnızca enerji 2 ve altında yazılır', () => {
  const minVersions = [
    { id: 'b2', label: 'Audit eğitimi', minutes: 60, min_minutes: 20, protected: false },
    { id: 'b1', label: 'Spor', minutes: 45, min_minutes: 15, protected: true },
  ]
  const low = volatileOf(input({ energyLevel: 2, minVersions }))
  assert.match(low, /DÜŞÜK ENERJİ: ASGARİ SÜRÜMLER \(enerji 2\/5\)/)
  assert.match(low, /id: b2 \| "Audit eğitimi" \| şimdi 60 dk, asgari 20 dk\n/)
  assert.match(low, /id: b1 \| "Spor" \| şimdi 45 dk, asgari 15 dk \| KORUMALI: bloğa dokunma/)

  assert.doesNotMatch(volatileOf(input({ energyLevel: 3, minVersions })), /ASGARİ SÜRÜMLER/)
  assert.doesNotMatch(volatileOf(input({ energyLevel: null, minVersions })), /ASGARİ SÜRÜMLER/)
  assert.doesNotMatch(volatileOf(input({ energyLevel: 1, minVersions: [] })), /ASGARİ SÜRÜMLER/)
})

test('prompt: sabit kısım kullanıcıdan bağımsız, kullanıcı verisi yalnızca değişken kısımda', () => {
  const a = input({ about: 'gizli not A', protectedBlocks: PROTECTED, maxDeepTasks: 2 })
  const b = input({ about: 'gizli not B', maxDeepTasks: 5 })
  assert.equal(stableOf(a), stableOf(b))
  assert.doesNotMatch(stableOf(a), /gizli not/)
  assert.match(stableOf(a), /KORUMALI BLOKLAR bölümündeki bloklara asla remove ya da move üretme/)
})

test('prompt: uzun ve orta tire kullanılmaz', () => {
  const text = JSON.stringify(buildPlannerPrompt(input({ protectedBlocks: PROTECTED, about: 'not' })))
  assert.doesNotMatch(text, /[\u2013\u2014]/)
})

// ---------- parsePlannerResult ----------

const KNOWN = new Set(['blk-1', 'blk-spor'])

const reply = (actions: unknown[], message = 'Tamam.') => JSON.stringify({ message, actions })

test('ayrıştırma: korumalı bloğa remove ve move reddedilir, mesaja not düşer', () => {
  const text = reply([
    { action: 'remove', block_id: 'blk-spor' },
    { action: 'move', block_id: 'blk-spor', block: { date: '2026-10-05', start_time: '12:00', end_time: '13:00' } },
    { action: 'remove', block_id: 'blk-1' },
  ], 'Sporu kaldırdım.')
  const result = parsePlannerResult(text, KNOWN, { protectedBlocks: PROTECTED })

  assert.deepEqual(result.actions, [{ action: 'remove', block_id: 'blk-1' }])
  assert.match(result.message, /^Sporu kaldırdım\./)
  assert.match(result.message, /Korumalı bloğa dokunmadım: Spor\.$/)
  // Aynı blok iki kez reddedilse de not tek kez yazılır.
  assert.equal(result.message.match(/Spor\./g)?.length, 1)
})

test('ayrıştırma: not dili isteğe uyar, korumalı bloksuz yanıt değişmez', () => {
  const text = reply([{ action: 'remove', block_id: 'blk-spor' }])
  const en = parsePlannerResult(text, KNOWN, { protectedBlocks: PROTECTED, lang: 'en' })
  assert.match(en.message, /I left the protected block untouched: Spor\./)

  const plain = parsePlannerResult(reply([{ action: 'remove', block_id: 'blk-1' }], 'Sildim.'), KNOWN)
  assert.equal(plain.message, 'Sildim.')
  assert.equal(plain.actions.length, 1)
})

test('ayrıştırma: korumalı blok için add serbest, bilinmeyen id eskisi gibi düşer', () => {
  const add = { action: 'add', block: { date: '2026-10-05', start_time: '09:00', end_time: '10:00', block_type: 'task', label: 'Rapor' } }
  const text = reply([add, { action: 'remove', block_id: 'uydurma' }, { action: 'move', block_id: 'blk-1' }])
  const result = parsePlannerResult(text, KNOWN, { protectedBlocks: PROTECTED })

  assert.deepEqual(result.actions, [add])
  assert.doesNotMatch(result.message, /Korumalı/)
})

test('ayrıştırma: etiketsiz korumalı blokta nota id yazılır', () => {
  const text = reply([{ action: 'remove', block_id: 'b9' }])
  const result = parsePlannerResult(text, new Set(['b9']), {
    protectedBlocks: [{ id: 'b9', start: '07:00', end: '08:00', label: '' }],
  })
  assert.match(result.message, /Korumalı bloğa dokunmadım: b9\./)
})

test('ayrıştırma: JSON çıkmazsa düz metin döner, eylem yok', () => {
  const result = parsePlannerResult('Merhaba, yardımcı olayım.', KNOWN, { protectedBlocks: PROTECTED })
  assert.deepEqual(result, { message: 'Merhaba, yardımcı olayım.', actions: [] })
})
