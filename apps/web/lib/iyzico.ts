import { createHmac, randomBytes } from 'crypto'

const IYZICO_API_URL =
  process.env['NODE_ENV'] === 'production'
    ? 'https://api.iyzipay.com'
    : 'https://sandbox.iyzipay.com'

const IYZICO_API_KEY = process.env['IYZICO_API_KEY'] ?? ''
const IYZICO_SECRET_KEY = process.env['IYZICO_SECRET_KEY'] ?? ''

export const PLANS = {
  pro_monthly: {
    name: 'LifeOS Pro Aylık',
    price: 4.99,
    currency: 'USD',
    interval: 'monthly' as const,
  },
  pro_annual: {
    name: 'LifeOS Pro Yıllık',
    price: 39.0,
    currency: 'USD',
    interval: 'annual' as const,
  },
} as const

export type PlanKey = keyof typeof PLANS

function generateRandomKey(length = 8): string {
  return randomBytes(length).toString('hex')
}

function buildAuthorizationHeader(randomKey: string, requestBody: string): string {
  const hashInput = IYZICO_API_KEY + randomKey + requestBody
  const hash = createHmac('sha256', IYZICO_SECRET_KEY).update(hashInput).digest('base64')
  return `IYZWSv2 ${IYZICO_API_KEY}:${randomKey}:${hash}`
}

async function iyzicoRequest<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const randomKey = generateRandomKey()
  const requestBody = JSON.stringify(body)
  const authorization = buildAuthorizationHeader(randomKey, requestBody)

  const response = await fetch(`${IYZICO_API_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authorization,
      'x-iyzi-rnd': randomKey,
      'x-iyzi-client-version': 'lifeos-1.0.0',
    },
    body: requestBody,
  })

  if (!response.ok) {
    throw new Error(`İyzico API error: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

export interface CheckoutFormInitializeResponse {
  status: string
  errorCode?: string
  errorMessage?: string
  locale?: string
  systemTime?: number
  conversationId?: string
  token?: string
  checkoutFormContent?: string
  tokenExpireTime?: number
  paymentPageUrl?: string
}

export interface CheckoutFormResultResponse {
  status: string
  errorCode?: string
  errorMessage?: string
  price?: number
  paidPrice?: number
  currency?: string
  paymentId?: string
  conversationId?: string
  token?: string
  callbackUrl?: string
}

export async function initializeCheckoutForm({
  conversationId,
  price,
  userId,
  email,
  name,
  surname,
  callbackUrl,
  planKey,
}: {
  conversationId: string
  price: number
  userId: string
  email: string
  name: string
  surname: string
  callbackUrl: string
  planKey: PlanKey
}): Promise<CheckoutFormInitializeResponse> {
  return iyzicoRequest<CheckoutFormInitializeResponse>('/payment/iyzipos/checkout-form/initialize', {
    locale: 'tr',
    conversationId,
    price: price.toString(),
    paidPrice: price.toString(),
    currency: 'USD',
    basketId: `${userId}-${planKey}-${Date.now()}`,
    paymentGroup: 'SUBSCRIPTION',
    callbackUrl,
    enabledInstallments: [1],
    buyer: {
      id: userId,
      name,
      surname,
      email,
      identityNumber: '11111111111',
      registrationAddress: 'Türkiye',
      city: 'İstanbul',
      country: 'Turkey',
    },
    shippingAddress: {
      contactName: `${name} ${surname}`,
      city: 'İstanbul',
      country: 'Turkey',
      address: 'Türkiye',
    },
    billingAddress: {
      contactName: `${name} ${surname}`,
      city: 'İstanbul',
      country: 'Turkey',
      address: 'Türkiye',
    },
    basketItems: [
      {
        id: planKey,
        name: PLANS[planKey].name,
        category1: 'Yazılım',
        itemType: 'VIRTUAL',
        price: price.toString(),
      },
    ],
  })
}

export async function retrieveCheckoutFormResult(
  token: string,
): Promise<CheckoutFormResultResponse> {
  return iyzicoRequest<CheckoutFormResultResponse>(
    '/payment/iyzipos/checkout-form/auth/detail',
    { locale: 'tr', token },
  )
}
