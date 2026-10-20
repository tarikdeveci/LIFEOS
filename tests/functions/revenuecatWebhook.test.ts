import { test } from 'node:test'
import assert from 'node:assert/strict'

import { decideRow, type RevenueCatEvent } from '../../supabase/functions/revenuecat-webhook/decide.ts'

const NOW = new Date('2026-10-20T10:00:00.000Z')
const USER = '11111111-2222-3333-4444-555555555555'

function purchase(overrides: Partial<RevenueCatEvent> = {}): RevenueCatEvent {
  return {
    type: 'INITIAL_PURCHASE',
    app_user_id: USER,
    product_id: 'PRO_1',
    store: 'APP_STORE',
    purchased_at_ms: NOW.getTime(),
    expiration_at_ms: NOW.getTime() + 30 * 86_400_000,
    period_type: 'NORMAL',
    ...overrides,
  }
}

test('iade (CUSTOMER_SUPPORT) Pro\'yu hemen kapatir', () => {
  const d = decideRow({ type: 'CANCELLATION', app_user_id: USER, cancel_reason: 'CUSTOMER_SUPPORT' }, NOW)
  assert.equal(d.action, 'update')
  if (d.action !== 'update') return
  assert.equal(d.patch['plan'], 'free')
  assert.equal(d.patch['status'], 'free')
  assert.equal('cancel_at_period_end' in d.patch, false)
})

test('iade, bitis gelecekteyse Pro o tarihe kadar surer (Play)', () => {
  const exp = NOW.getTime() + 10 * 86_400_000
  const d = decideRow(
    { type: 'CANCELLATION', app_user_id: USER, cancel_reason: 'CUSTOMER_SUPPORT', expiration_at_ms: exp, event_timestamp_ms: NOW.getTime() },
    NOW,
  )
  assert.equal(d.action, 'update')
  if (d.action !== 'update') return
  assert.equal('plan' in d.patch, false)
  assert.equal(d.patch['cancel_at_period_end'], true)
  assert.equal(d.patch['current_period_end'], new Date(exp).toISOString())
})

test('iade, bitis gecmisteyse free', () => {
  const d = decideRow(
    { type: 'CANCELLATION', app_user_id: USER, cancel_reason: 'CUSTOMER_SUPPORT', expiration_at_ms: NOW.getTime() - 1000, event_timestamp_ms: NOW.getTime() },
    NOW,
  )
  assert.equal(d.action, 'update')
  if (d.action !== 'update') return
  assert.equal(d.patch['plan'], 'free')
})

test('UNCANCELLATION gelecekteki bitisle plani geri yazar', () => {
  const exp = NOW.getTime() + 20 * 86_400_000
  const d = decideRow(
    { type: 'UNCANCELLATION', app_user_id: USER, product_id: 'PRO_2', expiration_at_ms: exp, event_timestamp_ms: NOW.getTime(), environment: 'SANDBOX' },
    NOW,
  )
  assert.equal(d.action, 'update')
  if (d.action !== 'update') return
  assert.equal(d.patch['plan'], 'pro_annual')
  assert.equal(d.patch['status'], 'pro_annual')
  assert.equal(d.patch['current_period_end'], new Date(exp).toISOString())
  assert.equal(d.patch['cancel_at_period_end'], false)
  assert.equal(d.patch['is_sandbox'], true)
})

test('UNCANCELLATION bitis yoksa yalniz iptal isaretini kaldirir', () => {
  const d = decideRow({ type: 'UNCANCELLATION', app_user_id: USER, product_id: 'PRO_1' }, NOW)
  assert.equal(d.action, 'update')
  if (d.action !== 'update') return
  assert.equal('plan' in d.patch, false)
  assert.equal(d.patch['cancel_at_period_end'], false)
})

test('SUBSCRIPTION_EXTENDED yalniz bitis tarihini gunceller', () => {
  const exp = NOW.getTime() + 40 * 86_400_000
  const d = decideRow({ type: 'SUBSCRIPTION_EXTENDED', app_user_id: USER, expiration_at_ms: exp }, NOW)
  assert.equal(d.action, 'update')
  if (d.action !== 'update') return
  assert.deepEqual(Object.keys(d.patch).sort(), ['current_period_end', 'updated_at'])
  assert.equal(d.patch['current_period_end'], new Date(exp).toISOString())
})

test('normal iptal donem sonunda biter', () => {
  const d = decideRow({ type: 'CANCELLATION', app_user_id: USER, cancel_reason: 'UNSUBSCRIBE' }, NOW)
  assert.equal(d.action, 'update')
  if (d.action !== 'update') return
  assert.equal(d.patch['cancel_at_period_end'], true)
  assert.equal(d.patch['cancelled_at'], NOW.toISOString())
  assert.equal('plan' in d.patch, false)
})

test('cancel_reason yoksa normal iptal sayilir', () => {
  const d = decideRow({ type: 'CANCELLATION', app_user_id: USER }, NOW)
  assert.equal(d.action, 'update')
  if (d.action !== 'update') return
  assert.equal(d.patch['cancel_at_period_end'], true)
})

test('SANDBOX alim is_sandbox true yazar', () => {
  const d = decideRow(purchase({ environment: 'SANDBOX' }), NOW)
  assert.equal(d.action, 'upsert')
  if (d.action !== 'upsert') return
  assert.equal(d.row['is_sandbox'], true)
  assert.equal(d.row['plan'], 'pro_monthly')
})

test('PRODUCTION alim is_sandbox false yazar', () => {
  const d = decideRow(purchase({ environment: 'PRODUCTION' }), NOW)
  assert.equal(d.action, 'upsert')
  if (d.action !== 'upsert') return
  assert.equal(d.row['is_sandbox'], false)
})

test('environment yoksa is_sandbox false', () => {
  const d = decideRow(purchase(), NOW)
  assert.equal(d.action, 'upsert')
  if (d.action !== 'upsert') return
  assert.equal(d.row['is_sandbox'], false)
})

test('EXPIRATION free yazar', () => {
  const d = decideRow({ type: 'EXPIRATION', app_user_id: USER }, NOW)
  assert.equal(d.action, 'update')
  if (d.action !== 'update') return
  assert.equal(d.patch['plan'], 'free')
})
