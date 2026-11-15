import { test } from 'node:test'
import assert from 'node:assert/strict'

import { decideRow, type RevenueCatEvent } from '../../supabase/functions/revenuecat-webhook/decide.ts'
import { envRate, netMonthlyUsd } from '../../supabase/functions/revenuecat-webhook/net.ts'

const DEFAULTS = { tax: 0.167, commission: 0.15 }
const NOW = new Date('2026-10-20T10:00:00.000Z')
const DAY = 86_400_000

function close(actual: number | null, expected: number): void {
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`)
}

test('net: oranlarla aylık', () => {
  close(netMonthlyUsd({ price: 4.99, tax_percentage: 0, commission_percentage: 0.15 }, 'pro_monthly', DEFAULTS), 4.2415)
})

test('net: yıllık 12\'ye bölünür', () => {
  close(netMonthlyUsd({ price: 39.99, tax_percentage: 0, commission_percentage: 0.15 }, 'pro_annual', DEFAULTS), (39.99 * 0.85) / 12)
})

test('net: oran yoksa varsayılan', () => {
  close(
    netMonthlyUsd({ price: 2.4, tax_percentage: null, commission_percentage: undefined }, 'pro_monthly', DEFAULTS),
    2.4 * (1 - 0.167 - 0.15),
  )
  // Aralık dışı oran varsayılana düşer.
  close(netMonthlyUsd({ price: 2.4, tax_percentage: 1.5, commission_percentage: -1 }, 'pro_monthly', DEFAULTS), 2.4 * (1 - 0.167 - 0.15))
})

test('net: deneme ve iade null döner', () => {
  assert.equal(netMonthlyUsd({ price: 0 }, 'pro_monthly', DEFAULTS), null)
  assert.equal(netMonthlyUsd({ price: -4.99 }, 'pro_monthly', DEFAULTS), null)
  assert.equal(netMonthlyUsd({ price: null }, 'pro_monthly', DEFAULTS), null)
})

test('net: kesinti fiyatı aşarsa 0, eski değer korunmaz', () => {
  assert.equal(netMonthlyUsd({ price: 4.99, tax_percentage: 0.5, commission_percentage: 0.5 }, 'pro_monthly', DEFAULTS), 0)
  assert.equal(netMonthlyUsd({ price: 4.99, tax_percentage: 0, commission_percentage: 1 }, 'pro_monthly', DEFAULTS), 0)
  assert.equal(row(purchase({ price: 4.99, tax_percentage: 0.6, commission_percentage: 0.6 }))['net_monthly_usd'], 0)
})

test('net: ortam oranı geçersizse varsayılan', () => {
  assert.equal(envRate(undefined, 0.15), 0.15)
  assert.equal(envRate('', 0.15), 0.15)
  assert.equal(envRate('abc', 0.15), 0.15)
  assert.equal(envRate('1.5', 0.15), 0.15)
  assert.equal(envRate('1', 0.15), 1)
  assert.equal(envRate('0', 0.15), 0)
  assert.equal(envRate('0.3', 0.15), 0.3)
})

function purchase(overrides: Partial<RevenueCatEvent> = {}): RevenueCatEvent {
  return {
    type: 'INITIAL_PURCHASE',
    app_user_id: '11111111-2222-3333-4444-555555555555',
    product_id: 'PRO_1',
    store: 'APP_STORE',
    purchased_at_ms: NOW.getTime(),
    expiration_at_ms: NOW.getTime() + 30 * DAY,
    period_type: 'NORMAL',
    environment: 'PRODUCTION',
    ...overrides,
  }
}

function row(event: RevenueCatEvent): Record<string, unknown> {
  const d = decideRow(event, NOW, null, DEFAULTS)
  assert.equal(d.action, 'upsert')
  return d.action === 'upsert' ? d.row : {}
}

test('net: alım ve yenileme satıra net yazar', () => {
  close(row(purchase({ price: 4.99, tax_percentage: 0, commission_percentage: 0.15 }))['net_monthly_usd'] as number, 4.2415)
  close(
    row(purchase({ type: 'RENEWAL', product_id: 'PRO_2', price: 39.99, tax_percentage: 0.1, commission_percentage: 0.15 }))['net_monthly_usd'] as number,
    (39.99 * 0.75) / 12,
  )
})

test('net: denemede mevcut değer korunur, sandbox siler', () => {
  assert.equal('net_monthly_usd' in row(purchase({ price: 0, period_type: 'TRIAL' })), false)
  assert.equal('net_monthly_usd' in row(purchase({ price: null })), false)
  const sandbox = row(purchase({ price: 4.99, environment: 'SANDBOX' }))
  assert.equal('net_monthly_usd' in sandbox, true)
  assert.equal(sandbox['net_monthly_usd'], null)
})

test('net: iade net geliri siler', () => {
  const now = decideRow({ type: 'CANCELLATION', app_user_id: 'u', cancel_reason: 'CUSTOMER_SUPPORT' }, NOW)
  assert.equal(now.action === 'update' && now.patch['net_monthly_usd'], null)
  const later = decideRow(
    { type: 'CANCELLATION', app_user_id: 'u', cancel_reason: 'CUSTOMER_SUPPORT', expiration_at_ms: NOW.getTime() + DAY },
    NOW,
  )
  assert.equal(later.action === 'update' && later.patch['net_monthly_usd'], null)
  // Normal iptal net geliri silmez: dönem sonuna kadar ödenmiş.
  const cancel = decideRow({ type: 'CANCELLATION', app_user_id: 'u' }, NOW)
  assert.equal(cancel.action === 'update' && 'net_monthly_usd' in cancel.patch, false)
})
