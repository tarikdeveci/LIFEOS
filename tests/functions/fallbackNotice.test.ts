import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  fallbackNoticeCopy,
  notifyFallbackOnce,
  type NoticeClient,
} from '../../supabase/functions/_shared/ai/fallbackNotice.ts'

const NOW = new Date('2026-10-20T12:00:00Z')

interface FakeOptions {
  existing?: boolean
  selectError?: boolean
  insertError?: boolean
  tokens?: string[]
}

function fakeClient(options: FakeOptions = {}) {
  const log = {
    inserts: [] as Record<string, unknown>[],
    deletes: [] as string[],
    filters: [] as [string, unknown][],
  }

  const query = (table: string, kind: 'select' | 'delete') => {
    const filters: [string, unknown][] = []
    const builder: Record<string, unknown> = {}
    const chain = (name: string) => (column: string, value: unknown) => {
      filters.push([`${name}:${column}`, value])
      return builder
    }
    builder.eq = chain('eq')
    builder.gte = chain('gte')
    builder.in = chain('in')
    builder.limit = () => builder
    builder.then = (resolve: (value: unknown) => unknown) => {
      log.filters.push(...filters)
      if (kind === 'delete') {
        log.deletes.push(table)
        return Promise.resolve({ error: null }).then(resolve)
      }
      if (table === 'events') {
        return Promise.resolve({
          data: options.existing ? [{ id: 1 }] : [],
          error: options.selectError ? { message: 'boom' } : null,
        }).then(resolve)
      }
      return Promise.resolve({
        data: (options.tokens ?? []).map((token) => ({ token })),
        error: null,
      }).then(resolve)
    }
    return builder
  }

  const client = {
    from: (table: string) => ({
      select: () => query(table, 'select'),
      insert: (row: Record<string, unknown>) => {
        log.inserts.push(row)
        return Promise.resolve({ error: options.insertError ? { message: 'x' } : null })
      },
      delete: () => query(table, 'delete'),
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

test('notice: ayda bir kez', async () => {
  const { client, log } = fakeClient({ existing: true, tokens: ['t1'] })
  const expo = stubExpo((m) => m.map(() => ({ status: 'ok' })))
  try {
    assert.equal(await notifyFallbackOnce(client, 'u1', 'tr', NOW), 'skipped')
    assert.equal(log.inserts.length, 0)
    assert.equal(expo.sent.length, 0)
    assert.ok(log.filters.some(([k, v]) => k === 'gte:created_at' && v === '2026-10-01T00:00:00.000Z'))
  } finally {
    expo.restore()
  }
})

test('notice: ilk kez', async () => {
  const { client, log } = fakeClient({ tokens: ['t1', 't2'] })
  const expo = stubExpo((m) => m.map(() => ({ status: 'ok' })))
  try {
    assert.equal(await notifyFallbackOnce(client, 'u1', 'en', NOW), 'sent')
    assert.deepEqual(log.inserts, [{ user_id: 'u1', name: 'ai_fallback_notified' }])
    assert.deepEqual(expo.sent.map((m) => m.to), ['t1', 't2'])
    assert.equal(expo.sent[0]!.title, 'Switched to light AI mode')
    assert.deepEqual(expo.sent[0]!.data, { type: 'ai_fallback' })
  } finally {
    expo.restore()
  }
})

test('notice: token yok', async () => {
  const { client, log } = fakeClient({ tokens: [] })
  const expo = stubExpo(() => [])
  try {
    assert.equal(await notifyFallbackOnce(client, 'u1', 'tr', NOW), 'skipped')
    assert.equal(log.inserts.length, 1)
    assert.equal(expo.sent.length, 0)
  } finally {
    expo.restore()
  }
})

test('notice: push düşerse kilit silinir', async () => {
  const { client, log } = fakeClient({ tokens: ['t1'] })
  const expo = stubExpo((m) => m.map(() => ({ status: 'error', details: { error: 'MessageRateExceeded' } })))
  try {
    assert.equal(await notifyFallbackOnce(client, 'u1', 'tr', NOW), 'failed')
    assert.equal(log.inserts.length, 1)
    assert.ok(log.deletes.includes('events'))
  } finally {
    expo.restore()
  }
})

test('notice: hata fırlatmaz', async () => {
  const { client } = fakeClient({ selectError: true })
  assert.equal(await notifyFallbackOnce(client, 'u1', 'tr', NOW), 'failed')

  const throwing = {
    from: () => {
      throw new Error('x')
    },
  } as unknown as NoticeClient
  assert.equal(await notifyFallbackOnce(throwing, 'u1', 'tr', NOW), 'failed')
})
