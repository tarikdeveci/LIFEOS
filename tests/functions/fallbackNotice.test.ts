import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  fallbackNoticeCopy,
  notifyFallbackOnce,
  type NoticeClient,
} from '../../supabase/functions/_shared/ai/fallbackNotice.ts'

const NOW = new Date('2026-10-20T12:00:00Z')

interface FakeOptions {
  /** Insert unique ihlali (23505) verir: bu ay zaten talep edilmis. */
  duplicate?: boolean
  insertError?: boolean
  tokens?: string[]
}

function fakeClient(options: FakeOptions = {}) {
  const log = {
    inserts: [] as Record<string, unknown>[],
    deletes: [] as [string, unknown][],
  }

  const tokenQuery = () => {
    const builder: Record<string, unknown> = {}
    builder.in = () => builder
    builder.eq = () => builder
    builder.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: (options.tokens ?? []).map((token) => ({ token })), error: null }).then(resolve)
    return builder
  }

  const deleteQuery = (table: string) => {
    const builder: Record<string, unknown> = {}
    builder.eq = (column: string, value: unknown) => {
      log.deletes.push([`${table}:${column}`, value])
      return builder
    }
    builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve)
    return builder
  }

  const client = {
    from: (table: string) => ({
      select: () => tokenQuery(),
      insert: (row: Record<string, unknown>) => {
        log.inserts.push(row)
        return {
          select: () => {
            if (options.duplicate) {
              return Promise.resolve({ data: null, error: { message: 'dup', code: '23505' } })
            }
            if (options.insertError) {
              return Promise.resolve({ data: null, error: { message: 'x', code: '42501' } })
            }
            return Promise.resolve({ data: [{ id: 77 }], error: null })
          },
        }
      },
      delete: () => deleteQuery(table),
    }),
  } as unknown as NoticeClient

  return { client, log }
}

function stubExpo(handler: (messages: { to: string }[]) => unknown[]) {
  const sent: { to: string; title: string; body: string; data?: Record<string, string> }[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    const messages = JSON.parse(String(init?.body)) as typeof sent
    sent.push(...messages)
    return new Response(JSON.stringify({ data: handler(messages) }), { status: 200 })
  }) as typeof fetch
  return {
    sent,
    restore: () => {
      globalThis.fetch = original
    },
  }
}

test('notice: metin', () => {
  assert.ok(fallbackNoticeCopy('tr', NOW).body.endsWith('Yenilenme: 1 Kasım.'))
  assert.equal(fallbackNoticeCopy('tr', NOW).title, 'Hafif AI moduna geçtin')
  assert.ok(fallbackNoticeCopy('tr', new Date('2026-12-31T23:00:00Z')).body.endsWith('1 Ocak.'))
  assert.ok(fallbackNoticeCopy('en', NOW).body.endsWith('Renews: November 1.'))
  assert.equal(fallbackNoticeCopy('en', NOW).title, 'Switched to light AI mode')
})

test('notice: ayda bir kez (unique ihlali talebi reddeder)', async () => {
  const { client, log } = fakeClient({ duplicate: true, tokens: ['t1'] })
  const expo = stubExpo((m) => m.map(() => ({ status: 'ok' })))
  try {
    assert.equal(await notifyFallbackOnce(client, 'u1', 'tr', NOW), 'skipped')
    assert.equal(log.inserts.length, 1)
    assert.equal(expo.sent.length, 0)
    assert.equal(log.deletes.length, 0)
  } finally {
    expo.restore()
  }
})

test('notice: ilk kez, kilit satirina ay yazilir', async () => {
  const { client, log } = fakeClient({ tokens: ['t1', 't2'] })
  const expo = stubExpo((m) => m.map(() => ({ status: 'ok' })))
  try {
    assert.equal(await notifyFallbackOnce(client, 'u1', 'en', NOW), 'sent')
    assert.deepEqual(log.inserts, [{ user_id: 'u1', name: 'ai_fallback_notified', props: { month: '2026-10' } }])
    assert.deepEqual(expo.sent.map((m) => m.to), ['t1', 't2'])
    assert.equal(expo.sent[0]!.title, 'Switched to light AI mode')
    assert.deepEqual(expo.sent[0]!.data, { type: 'ai_fallback' })
    assert.equal(log.deletes.length, 0)
  } finally {
    expo.restore()
  }
})

test('notice: token yok, kilit birakilir ve skipped doner', async () => {
  const { client, log } = fakeClient({ tokens: [] })
  const expo = stubExpo(() => [])
  try {
    assert.equal(await notifyFallbackOnce(client, 'u1', 'tr', NOW), 'skipped')
    assert.equal(log.inserts.length, 1)
    assert.equal(expo.sent.length, 0)
    assert.deepEqual(log.deletes, [['events:id', 77]])
  } finally {
    expo.restore()
  }
})

test('notice: push dusarse yalniz kendi kilidi silinir', async () => {
  const { client, log } = fakeClient({ tokens: ['t1'] })
  const expo = stubExpo((m) => m.map(() => ({ status: 'error', details: { error: 'MessageRateExceeded' } })))
  try {
    assert.equal(await notifyFallbackOnce(client, 'u1', 'tr', NOW), 'failed')
    assert.equal(log.inserts.length, 1)
    assert.deepEqual(log.deletes, [['events:id', 77]])
  } finally {
    expo.restore()
  }
})

test('notice: hata firlatmaz', async () => {
  const { client } = fakeClient({ insertError: true })
  assert.equal(await notifyFallbackOnce(client, 'u1', 'tr', NOW), 'failed')

  const throwing = {
    from: () => {
      throw new Error('x')
    },
  } as unknown as NoticeClient
  assert.equal(await notifyFallbackOnce(throwing, 'u1', 'tr', NOW), 'failed')
})
