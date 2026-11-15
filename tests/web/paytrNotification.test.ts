import { test } from 'node:test'
import assert from 'node:assert/strict'

import { handlePaytrNotification, type PaytrDb, type PaytrIpn } from '../../apps/web/lib/paytrNotification.ts'

type Err = { message: string } | null
interface FakeOptions {
  payment?: { plan: string } | null
  pError?: Err
  rpcResult?: string
  rpcError?: Err
}

function fakeDb(options: FakeOptions = {}) {
  const calls: string[] = []
  const payment = 'payment' in options ? options.payment : { plan: 'pro_monthly' }
  const rpcResult = 'rpcResult' in options ? options.rpcResult : 'ok'
  const db = {
    from(table: string) {
      return {
        select() {
          const chain: Record<string, unknown> = {
            eq: () => chain,
            maybeSingle: () => Promise.resolve({ data: payment, error: options.pError ?? null }),
          }
          return chain
        }
      }
    },
    rpc(name: string) {
      calls.push(`rpc:${name}`)
      return Promise.resolve({ data: rpcResult, error: options.rpcError ?? null })
    }
  } as unknown as PaytrDb
  return { db, calls }
}

const ipn = (extra: Partial<PaytrIpn> = {}): PaytrIpn => ({
  merchantOid: 'oid1', status: 'success', totalAmount: '9990', hash: 'h', ...extra,
})
const deps = (db: PaytrDb, verify = true) => ({
  db, verifyHash: () => verify, netMonthlyUsd: () => 1.5, now: () => new Date('2026-01-31T10:00:00Z'),
})

test('paytr ipn: başarılı ödeme rpc çağırır, OK döner', async () => {
  const { db, calls } = fakeDb()
  const result = await handlePaytrNotification(ipn(), deps(db))
  assert.deepEqual(result, { status: 200, body: 'OK' })
  assert.deepEqual(calls, ['rpc:paytr_settle_payment'])
})

test('paytr ipn: rpc hatasında 500 döner', async () => {
  const { db, calls } = fakeDb({ rpcError: { message: 'db down' } })
  const result = await handlePaytrNotification(ipn(), deps(db))
  assert.equal(result.status, 500)
  assert.notEqual(result.body, 'OK')
  assert.deepEqual(calls, ['rpc:paytr_settle_payment'])
})

test('paytr ipn: payment okuma hatası tekrar denetir (500)', async () => {
  const { db, calls } = fakeDb({ pError: { message: 'timeout' } })
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

test('paytr ipn: bilinmeyen oid OK döner (ilk kontrol)', async () => {
  const { db, calls } = fakeDb({ payment: null })
  const result = await handlePaytrNotification(ipn(), deps(db))
  assert.deepEqual(result, { status: 200, body: 'OK' })
  assert.deepEqual(calls, [])
})

test('paytr ipn: rpc not_found dönerse OK', async () => {
  const { db, calls } = fakeDb({ rpcResult: 'not_found' })
  const result = await handlePaytrNotification(ipn(), deps(db))
  assert.deepEqual(result, { status: 200, body: 'OK' })
  assert.deepEqual(calls, ['rpc:paytr_settle_payment'])
})

test('paytr ipn: rpc already dönerse OK', async () => {
  const { db, calls } = fakeDb({ rpcResult: 'already' })
  const result = await handlePaytrNotification(ipn(), deps(db))
  assert.deepEqual(result, { status: 200, body: 'OK' })
  assert.deepEqual(calls, ['rpc:paytr_settle_payment'])
})
