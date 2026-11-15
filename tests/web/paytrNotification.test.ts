import { test } from 'node:test'
import assert from 'node:assert/strict'

import { handlePaytrNotification, type PaytrDb, type PaytrIpn } from '../../apps/web/lib/paytrNotification.ts'

type Err = { message: string } | null
interface FakeOptions {
  subscription?: { user_id: string; plan: string } | null
  subError?: Err
  existing?: unknown[]
  existingError?: Err
  updateError?: Err
  insertError?: Err
}

function fakeDb(options: FakeOptions = {}) {
  const calls: string[] = []
  const subscription = 'subscription' in options ? options.subscription : { user_id: 'u1', plan: 'pro_monthly' }
  const db = {
    from(table: string) {
      return {
        select() {
          const chain: Record<string, unknown> = {
            eq: () => chain,
            limit: () => Promise.resolve({ data: options.existing ?? [], error: options.existingError ?? null }),
            maybeSingle: () => Promise.resolve({ data: subscription, error: options.subError ?? null }),
          }
          return chain
        },
        update() {
          calls.push(`update:${table}`)
          return { eq: () => Promise.resolve({ error: options.updateError ?? null }) }
        },
        insert() {
          calls.push(`insert:${table}`)
          return Promise.resolve({ error: options.insertError ?? null })
        },
      }
    },
  } as unknown as PaytrDb
  return { db, calls }
}

const ipn = (extra: Partial<PaytrIpn> = {}): PaytrIpn => ({
  merchantOid: 'oid1', status: 'success', totalAmount: '9990', hash: 'h', ...extra,
})
const deps = (db: PaytrDb, verify = true) => ({
  db, verifyHash: () => verify, netMonthlyUsd: () => 1.5, now: () => new Date('2026-01-31T10:00:00Z'),
})

test('paytr ipn: başarılı ödeme abonelik ve geçmişi yazar, OK döner', async () => {
  const { db, calls } = fakeDb()
  const result = await handlePaytrNotification(ipn(), deps(db))
  assert.deepEqual(result, { status: 200, body: 'OK' })
  assert.deepEqual(calls, ['update:subscriptions', 'insert:payment_history'])
})

test('paytr ipn: abonelik yazma hatasında OK dönmez, geçmiş yazılmaz', async () => {
  const { db, calls } = fakeDb({ updateError: { message: 'db down' } })
  const result = await handlePaytrNotification(ipn(), deps(db))
  assert.equal(result.status, 500)
  assert.notEqual(result.body, 'OK')
  assert.deepEqual(calls, ['update:subscriptions'])
})

test('paytr ipn: geçmiş yazma hatasında OK dönmez', async () => {
  const { db } = fakeDb({ insertError: { message: 'db down' } })
  const result = await handlePaytrNotification(ipn(), deps(db))
  assert.equal(result.status, 500)
  assert.notEqual(result.body, 'OK')
})

test('paytr ipn: başarısız ödeme geçmişi yazılamazsa da OK dönmez', async () => {
  const { db, calls } = fakeDb({ insertError: { message: 'db down' } })
  const result = await handlePaytrNotification(ipn({ status: 'failed' }), deps(db))
  assert.equal(result.status, 500)
  assert.deepEqual(calls, ['insert:payment_history'])
})

test('paytr ipn: abonelik okuma hatası tekrar denetir', async () => {
  const { db, calls } = fakeDb({ subError: { message: 'timeout' } })
  const result = await handlePaytrNotification(ipn(), deps(db))
  assert.equal(result.status, 500)
  assert.deepEqual(calls, [])
})

test('paytr ipn: imza hatası 400, hiçbir şey yazılmaz', async () => {
  const { db, calls } = fakeDb()
  const result = await handlePaytrNotification(ipn(), deps(db, false))
  assert.equal(result.status, 400)
  assert.deepEqual(calls, [])
})

test('paytr ipn: eksik alan 400', async () => {
  const { db } = fakeDb()
  assert.equal((await handlePaytrNotification(ipn({ hash: '' }), deps(db))).status, 400)
})

test('paytr ipn: bilinmeyen oid OK döner (tekrar denemek düzeltmez)', async () => {
  const { db, calls } = fakeDb({ subscription: null })
  const result = await handlePaytrNotification(ipn(), deps(db))
  assert.deepEqual(result, { status: 200, body: 'OK' })
  assert.deepEqual(calls, [])
})

test('paytr ipn: çift bildirim ikinci kez yazmaz', async () => {
  const { db, calls } = fakeDb({ existing: [{ id: 'x' }] })
  const result = await handlePaytrNotification(ipn(), deps(db))
  assert.deepEqual(result, { status: 200, body: 'OK' })
  assert.deepEqual(calls, [])
})
