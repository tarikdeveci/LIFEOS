import { test } from 'node:test'
import assert from 'node:assert/strict'

import { AI_CHAT_MESSAGE_MAX } from '../../packages/shared/src/constants/index.ts'
import type { RouteContext, SuggestRequest } from '../../supabase/functions/ai-suggest/request.ts'

// model.ts modül yüklenirken Deno.env okur.
Object.assign(globalThis, { Deno: { env: { get: () => undefined } } })
const {
  readReplanInput, REPLAN_MESSAGE_MAX, REPLAN_HISTORY_TURN_MAX, REPLAN_HISTORY_TURNS, REPLAN_BLOCKS_MAX, REPLAN_LABEL_MAX,
} = await import('../../supabase/functions/ai-suggest/request.ts')
const { handleReplan } = await import('../../supabase/functions/ai-suggest/planning.ts')

const body = (extra: Partial<SuggestRequest> = {}): SuggestRequest => ({ type: 'replan', ...extra })
const block = (extra: Record<string, unknown> = {}) => ({ id: 'b1', start: '09:00', end: '10:00', label: 'Odak', ...extra })

function okInput(request: SuggestRequest) {
  const input = readReplanInput(request)
  assert.equal(input.ok, true, JSON.stringify(input))
  if (!input.ok) throw new Error('beklenmedik ret')
  return input
}

function rejected(request: SuggestRequest, code: string) {
  const input = readReplanInput(request)
  assert.equal(input.ok, false)
  if (!input.ok) assert.equal(input.code, code)
}

test('replan: istemci ve sunucu aynı mesaj sınırını kullanır', () => {
  assert.equal(REPLAN_MESSAGE_MAX, AI_CHAT_MESSAGE_MAX)
})

test('replan: sınırdaki mesaj kabul edilir ve kesilmez, bir fazlası reddedilir', () => {
  const exact = 'a'.repeat(REPLAN_MESSAGE_MAX)
  assert.equal(okInput(body({ user_message: `  ${exact}  ` })).userMessage, exact)
  rejected(body({ user_message: 'a'.repeat(REPLAN_MESSAGE_MAX + 1) }), 'message_too_long')
})

test('replan: mesajsız istek geçer (sunucu varsayılan mesajı koyar)', () => {
  assert.equal(okInput(body()).userMessage, '')
  assert.equal(okInput(body({ user_message: 42 as unknown as string })).userMessage, '')
})

test('replan: geçersiz tarih reddedilir, yoksa ya da geçerliyse geçer', () => {
  rejected(body({ date: '2026-10-10'.repeat(1000) }), 'invalid_date')
  rejected(body({ date: 'yarın' }), 'invalid_date')
  assert.equal(okInput(body()).date, null)
  assert.equal(okInput(body({ date: '2026-10-10' })).date, '2026-10-10')
})

test('replan: geçmiş son 8 mesaja ve mesaj başına sınıra iner', () => {
  const history = Array.from({ length: 50 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `m${i} ${'x'.repeat(10_000)}` }))
  const input = okInput(body({ history }))
  assert.equal(input.history.length, REPLAN_HISTORY_TURNS)
  assert.ok(input.history[0]!.text.startsWith('m42 '))
  for (const turn of input.history) assert.equal(turn.text.length, REPLAN_HISTORY_TURN_MAX)
})

test('replan: eski mobil geçmiş biçimi ({role, content}) okunmaya devam eder', () => {
  const input = okInput(body({ history: [{ role: 'user', content: 'selam' }, { role: 'assistant', content: 'merhaba' }] }))
  assert.deepEqual(input.history, [{ role: 'user', text: 'selam' }, { role: 'assistant', text: 'merhaba' }])
})

test('replan: bloklar doğrulanır, etiket kısaltılır, uzun kimlik düşer', () => {
  const input = okInput(body({
    existing_blocks: [
      block(),
      block({ id: 'x'.repeat(65), start: '13:00:00', end: '14:30:00', label: `  çok   uzun ${'e'.repeat(500)}` }),
    ],
  }))
  assert.deepEqual(input.blocks[0], { id: 'b1', start: '09:00', end: '10:00', label: 'Odak' })
  assert.equal(input.blocks[1]!.id, undefined)
  assert.equal(input.blocks[1]!.start, '13:00:00')
  assert.equal(input.blocks[1]!.label.length, REPLAN_LABEL_MAX)
  assert.ok(input.blocks[1]!.label.startsWith('çok uzun e'))
})

test('replan: bozuk blok atlanır, istek düşmez; fazlası sınırda kesilir', () => {
  assert.deepEqual(okInput(body({ existing_blocks: 'blok' as unknown as SuggestRequest['existing_blocks'] })).blocks, [])
  const mixed = okInput(body({
    existing_blocks: [
      block({ start: '9' }), block({ end: '25:00' }), null, block({ id: 'ok' }),
    ] as unknown as SuggestRequest['existing_blocks'],
  }))
  assert.deepEqual(mixed.blocks.map((b) => b.id), ['ok'])
  // Postgres gün sonunu 24:00:00 olarak tutabiliyor.
  assert.equal(okInput(body({ existing_blocks: [block({ start: '23:00:00', end: '24:00:00' })] })).blocks.length, 1)
  const many = Array.from({ length: REPLAN_BLOCKS_MAX + 50 }, () => block())
  assert.equal(okInput(body({ existing_blocks: many })).blocks.length, REPLAN_BLOCKS_MAX)
})

test('replan: saat HH:MM\'e iner, en-US gece yarısı "24:05" 00:05 olur, bozuk saat yok sayılır', () => {
  assert.equal(okInput(body({ current_time: '14:30' })).currentTime, '14:30')
  assert.equal(okInput(body({ current_time: '9:05 PM' })).currentTime, '09:05')
  assert.equal(okInput(body({ current_time: '24:05' })).currentTime, '00:05')
  assert.equal(okInput(body({ current_time: '99:99' })).currentTime, null)
  assert.equal(okInput(body({ current_time: 'x'.repeat(5000) })).currentTime, null)
  assert.equal(okInput(body()).currentTime, null)
})

test('replan rotası: geçersiz girdi 400, veritabanına, hakka ve modele dokunmaz', async () => {
  const touched: string[] = []
  const trap = (name: string) => new Proxy({}, { get: () => { touched.push(name); throw new Error(`${name} kullanılmamalı`) } })
  const route = {
    supabase: trap('supabase'),
    client: trap('model'),
    ledger: trap('ledger'),
    userId: 'u1',
    body: body({ user_message: 'a'.repeat(REPLAN_MESSAGE_MAX + 1) }),
    chatModel: 'claude-opus-5',
    lang: 'tr',
    langInstr: '',
    today: '2026-10-10',
    json: (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status }),
  } as unknown as RouteContext

  const response = await handleReplan(route)
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), {
    error: `Mesaj en çok ${REPLAN_MESSAGE_MAX} karakter olabilir`, code: 'message_too_long', max: REPLAN_MESSAGE_MAX,
  })
  assert.deepEqual(touched, [])
})
