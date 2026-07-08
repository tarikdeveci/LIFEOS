import { createHmac } from 'crypto'

const PAYTR_MERCHANT_ID = process.env['PAYTR_MERCHANT_ID'] ?? ''
const PAYTR_MERCHANT_KEY = process.env['PAYTR_MERCHANT_KEY'] ?? ''
const PAYTR_MERCHANT_SALT = process.env['PAYTR_MERCHANT_SALT'] ?? ''
const PAYTR_API_URL = 'https://www.paytr.com/odeme/api/get-token'

export const PLANS = {
  pro_monthly: {
    name: 'LifeOS Pro Aylık',
    price: 99.90,
    paymentAmount: 9990, // TRY kuruş
    currency: 'TL',
    interval: 'monthly' as const,
  },
  pro_annual: {
    name: 'LifeOS Pro Yıllık',
    price: 790.0,
    paymentAmount: 79000, // TRY kuruş
    currency: 'TL',
    interval: 'annual' as const,
  },
} as const

export type PlanKey = keyof typeof PLANS

export interface PayTRTokenResponse {
  status: 'success' | 'failed'
  token?: string
  reason?: string
}

function generateMerchantOid(userId: string): string {
  const uid = userId.replace(/-/g, '').substring(0, 8)
  return `LOS${uid}${Date.now()}`
}

function buildPayTRHash({
  userIp,
  merchantOid,
  email,
  paymentAmount,
  userBasket,
  noInstallment,
  maxInstallment,
  currency,
  testMode,
}: {
  userIp: string
  merchantOid: string
  email: string
  paymentAmount: number
  userBasket: string
  noInstallment: string
  maxInstallment: string
  currency: string
  testMode: string
}): string {
  // Hash sırası: merchant_id+user_ip+merchant_oid+email+payment_amount+user_basket+no_installment+max_installment+currency+test_mode+merchant_salt
  // debug_on hash'e dahil DEĞİL
  const hashStr =
    PAYTR_MERCHANT_ID +
    userIp +
    merchantOid +
    email +
    paymentAmount.toString() +
    userBasket +
    noInstallment +
    maxInstallment +
    currency +
    testMode +
    PAYTR_MERCHANT_SALT
  return createHmac('sha256', PAYTR_MERCHANT_KEY).update(hashStr).digest('base64')
}

export async function createPayTRPayment({
  userId,
  email,
  userName,
  userIp,
  planKey,
  okUrl,
  failUrl,
  notificationUrl,
}: {
  userId: string
  email: string
  userName: string
  userIp: string
  planKey: PlanKey
  okUrl: string
  failUrl: string
  notificationUrl: string
}): Promise<{ merchantOid: string; token: string; paymentUrl: string }> {
  const plan = PLANS[planKey]
  const merchantOid = generateMerchantOid(userId)
  const testMode = process.env['NODE_ENV'] !== 'production' ? '1' : '0'
  const noInstallment = '1'
  const maxInstallment = '0'

  const userBasket = Buffer.from(
    JSON.stringify([[plan.name, plan.price.toFixed(2), 1]]),
  ).toString('base64')

  const debugOn = process.env['NODE_ENV'] !== 'production' ? '1' : '0'

  const paytrToken = buildPayTRHash({
    userIp,
    merchantOid,
    email,
    paymentAmount: plan.paymentAmount,
    userBasket,
    noInstallment,
    maxInstallment,
    currency: plan.currency,
    testMode,
  })

  const params = new URLSearchParams({
    merchant_id: PAYTR_MERCHANT_ID,
    user_ip: userIp,
    merchant_oid: merchantOid,
    email,
    payment_amount: plan.paymentAmount.toString(),
    paytr_token: paytrToken,
    user_basket: userBasket,
    debug_on: debugOn,
    no_installment: noInstallment,
    max_installment: maxInstallment,
    user_name: userName,
    user_address: 'Türkiye',
    user_phone: '05000000000',
    merchant_ok_url: okUrl,
    merchant_fail_url: failUrl,
    merchant_notification_url: notificationUrl,
    currency: plan.currency,
    test_mode: testMode,
    lang: 'tr',
  })

  const bodyStr = params.toString()

  const response = await fetch(PAYTR_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: bodyStr,
  })

  const responseBody = await response.text()

  if (!response.ok) {
    throw new Error(`PayTR API hatası: ${response.status} ${response.statusText} | body: ${responseBody}`)
  }

  const data = JSON.parse(responseBody) as PayTRTokenResponse

  if (data.status === 'failed' || !data.token) {
    throw new Error(data.reason ?? 'PayTR token alınamadı')
  }

  return {
    merchantOid,
    token: data.token,
    paymentUrl: `https://www.paytr.com/odeme/guvenli/${data.token}`,
  }
}

export function verifyNotificationHash(
  merchantOid: string,
  status: string,
  totalAmount: string,
  incomingHash: string,
): boolean {
  const hashStr = merchantOid + PAYTR_MERCHANT_SALT + status + totalAmount
  const expected = createHmac('sha256', PAYTR_MERCHANT_KEY).update(hashStr).digest('base64')
  return expected === incomingHash
}
