// RevenueCat event'ini subscriptions satırına çeviren saf mantık (test edilebilir).

export interface RevenueCatEvent {
  type: string
  app_user_id: string
  original_transaction_id?: string
  purchased_at_ms?: number
  expiration_at_ms?: number
  store?: string
  product_id?: string
  period_type?: string
  /** İşlemin USD fiyatı. Denemede 0, iadede negatif, bilinmiyorsa null. */
  price?: number | null
  /** RENEWAL: bu yenileme ücretsiz denemenin ücretliye dönüşü mü */
  is_trial_conversion?: boolean
  /** CANCELLATION: iade `CUSTOMER_SUPPORT` ile gelir. */
  cancel_reason?: string
  /** 'SANDBOX' | 'PRODUCTION' */
  environment?: string
}

export type Decision =
  | { action: 'upsert'; row: Record<string, unknown> }
  | { action: 'update'; patch: Record<string, unknown> }
  | { action: 'skip'; level: 'warn' | 'error' | 'log'; message: string }

export function mapStore(store: string | undefined): string {
  if (store === 'APP_STORE') return 'app_store'
  if (store === 'PLAY_STORE') return 'play_store'
  return store?.toLowerCase() ?? 'unknown'
}

// Ürün ID'sinden planı çöz. App Store: PRO_1/PRO_2, Play: pro_1/pro_2.
// Bilinmeyen ürün gelirse aylığa düşmek yanlış olur (yıllık ödeyen aylık görünür),
// o yüzden null dönüp event'i atlıyoruz.
export function planFromProductId(productId: string | undefined): 'pro_monthly' | 'pro_annual' | null {
  if (!productId) return null
  // Play, ürün kimliğini "PRO_1:aylik" gibi productId:basePlanId biçiminde
  // gönderebiliyor; App Store yalnızca "PRO_1".
  const id = productId.toLowerCase().split(':')[0]
  if (id === 'pro_1') return 'pro_monthly'
  if (id === 'pro_2') return 'pro_annual'
  return null
}

const PERIOD_TYPES = new Set(['trial', 'intro', 'normal', 'promotional', 'prepaid'])

/** RevenueCat dönem tipi ('TRIAL', 'NORMAL', ...) küçük harfle; bilinmeyen değer null. */
export function normalizePeriodType(value: string | undefined): string | null {
  const lower = value?.toLowerCase() ?? ''
  return PERIOD_TYPES.has(lower) ? lower : null
}

export function decideRow(event: RevenueCatEvent, now: Date): Decision {
  const userId = event.app_user_id
  const source = mapStore(event.store)
  const nowIso = now.toISOString()

  switch (event.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL': {
      if (!event.expiration_at_ms) {
        return { action: 'skip', level: 'warn', message: `Ignoring ${event.type} without expiration_at_ms for user ${userId}` }
      }

      const plan = planFromProductId(event.product_id)
      if (!plan) {
        return {
          action: 'skip',
          level: 'error',
          message: `Ignoring ${event.type} for user ${userId}: unknown product_id "${event.product_id}" via ${source}`,
        }
      }

      const periodType = normalizePeriodType(event.period_type)
      const periodStart = event.purchased_at_ms ? new Date(event.purchased_at_ms).toISOString() : nowIso
      const periodEnd = new Date(event.expiration_at_ms).toISOString()

      const row: Record<string, unknown> = {
        user_id: userId,
        plan,
        status: plan,
        // Deneme de Pro'dur; AI bütçesi denemede ayrı (_shared/ai/usage.ts).
        period_type: periodType,
        iyzico_subscription_reference_code: event.original_transaction_id ?? null,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        // Sandbox alımlar yazılır (Apple incelemecisi Pro görmeli) ama işaretlenir.
        is_sandbox: event.environment === 'SANDBOX',
        updated_at: nowIso,
      }

      // Yeni abonelik: önceki bir aboneliğin iptal işareti taşınmamalı.
      // RENEWAL'da dokunulmuyor; gecikmiş bir yenileme olayı, sonradan gelen
      // iptali silebilirdi.
      if (event.type === 'INITIAL_PURCHASE') {
        row['cancel_at_period_end'] = false
        row['cancelled_at'] = null
      }

      // Deneme hunisi (analytics.trial_cohorts).
      if (periodType === 'trial') {
        row['trial_ends_at'] = periodEnd
        if (event.type === 'INITIAL_PURCHASE') row['trial_started_at'] = periodStart
      }
      if (event.is_trial_conversion === true) row['trial_converted_at'] = nowIso

      // AI bütçesi ödenen fiyatla ölçekleniyor. Denemede fiyat 0 geliyor;
      // 0 ile ezersek dönüşümden sonra bütçe tabana düşer.
      if (typeof event.price === 'number' && event.price > 0) row['price_usd'] = event.price

      return { action: 'upsert', row }
    }

    case 'CANCELLATION':
      // İade (müşteri desteği) dönem sonunu beklemez: Pro hemen kapanır.
      if (event.cancel_reason === 'CUSTOMER_SUPPORT') {
        return { action: 'update', patch: { plan: 'free', status: 'free', updated_at: nowIso } }
      }
      return {
        action: 'update',
        patch: { cancel_at_period_end: true, cancelled_at: nowIso, updated_at: nowIso },
      }

    // İptal edip dönem bitmeden geri alan kullanıcı. Denemede sık: kullanıcı
    // "unutmayayım" diye hemen iptal eder, sonra vazgeçer.
    case 'UNCANCELLATION':
      return { action: 'update', patch: { cancel_at_period_end: false, cancelled_at: null, updated_at: nowIso } }

    case 'EXPIRATION':
      return { action: 'update', patch: { plan: 'free', status: 'free', updated_at: nowIso } }

    default:
      // Diğer event tipleri (TEST, PRODUCT_CHANGE vb.) — logla ve geç
      return { action: 'skip', level: 'log', message: `Unhandled RevenueCat event type: ${event.type} for user ${userId} via ${source}` }
  }
}
