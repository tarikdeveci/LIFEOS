import { test } from 'node:test'
import assert from 'node:assert/strict'

import { paytrNetMonthlyUsd } from '../../apps/web/lib/paytrNet.ts'

function close(actual: number | null, expected: number): void {
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`)
}

test('paytr: aylık', () => {
  close(paytrNetMonthlyUsd('9990', 'pro_monthly', { usdTry: '42', commissionPct: '0.03' }), (99.9 / 1.2) * 0.97 / 42)
})

test('paytr: yıllık', () => {
  close(paytrNetMonthlyUsd('79000', 'pro_annual', { usdTry: '42', commissionPct: '0.03' }), (790 / 1.2) * 0.97 / 42 / 12)
})

test('paytr: kur yoksa null', () => {
  assert.equal(paytrNetMonthlyUsd('9990', 'pro_monthly', {}), null)
  assert.equal(paytrNetMonthlyUsd('9990', 'pro_monthly', { usdTry: '' }), null)
  assert.equal(paytrNetMonthlyUsd('9990', 'pro_monthly', { usdTry: 'abc' }), null)
  // Komisyon boş ya da geçersizse 0.03.
  close(paytrNetMonthlyUsd('9990', 'pro_monthly', { usdTry: '42' }), (99.9 / 1.2) * 0.97 / 42)
  close(paytrNetMonthlyUsd('9990', 'pro_monthly', { usdTry: '42', commissionPct: '' }), (99.9 / 1.2) * 0.97 / 42)
  close(paytrNetMonthlyUsd('9990', 'pro_monthly', { usdTry: '42', commissionPct: 'x' }), (99.9 / 1.2) * 0.97 / 42)
})

test('paytr: bozuk tutar null', () => {
  assert.equal(paytrNetMonthlyUsd('abc', 'pro_monthly', { usdTry: '42' }), null)
  assert.equal(paytrNetMonthlyUsd('0', 'pro_monthly', { usdTry: '42' }), null)
  // Kuruş tam sayı metni olmalı: onaltılık, ondalık ve üslü yazım bozuk sayılır.
  assert.equal(paytrNetMonthlyUsd('0x2706', 'pro_monthly', { usdTry: '42' }), null)
  assert.equal(paytrNetMonthlyUsd('99.90', 'pro_monthly', { usdTry: '42' }), null)
  assert.equal(paytrNetMonthlyUsd('1e4', 'pro_monthly', { usdTry: '42' }), null)
})

test('paytr: sonlu olmayan sonuç null', () => {
  // Çok küçük kur Infinity üretir; JSON'da null olup mevcut değeri silerdi.
  assert.equal(paytrNetMonthlyUsd('9990', 'pro_monthly', { usdTry: '1e-310' }), null)
})
