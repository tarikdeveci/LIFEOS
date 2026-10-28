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
  /** Event'in RevenueCat'te oluştuğu an (ms). */
  event_timestamp_ms?: number
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

/** Kullanıcının olaydan önceki satırı (yoksa null). */
export interface ExistingRow {
  plan: string | null
  current_period_end: string | null
  is_sandbox: boolean | null
}

// RevenueCat olayları sırasız ve tekrar teslim edilebilir. Olayın bitişi
// satırdakinden eskiyse olay, satırı yazan yenilemeden öncesine aittir.
function isStale(event: RevenueCatEvent, existing: ExistingRow | null): boolean {
  if (!existing?.current_period_end || !event.expiration_at_ms) return false
  return Date.parse(existing.current_period_end) > event.expiration_at_ms
}

export function decideRow(event: RevenueCatEvent, now: Date, existing: ExistingRow | null = null): Decision {
  const userId = event.app_user_id
  const source = mapStore(event.store)
  const nowIso = now.toISOString()
  // Karşılaştırma referansı: event'in oluştuğu an (gecikmiş teslimde doğru sonuç).
  const nowMs = event.event_timestamp_ms ?? now.getTime()

  // Sandbox olayı süren üretim aboneliğine dokunmaz (TestFlight ile deneyen
  // ödeyen kullanıcı free'ye düşmesin, üretim satırı sandbox'a dönmesin).
  if (
    event.environment === 'SANDBOX' &&
    existing?.is_sandbox === false &&
    existing.plan !== null &&
    existing.plan !== 'free' &&
    existing.current_period_end !== null &&
    Date.parse(existing.current_period_end) > nowMs
  ) {
    return { action: 'skip', level: 'warn', message: `Ignoring SANDBOX ${event.type} for user ${userId}: production subscription active` }
  }

  const stale = isStale(event, existing)
  const skipStale: Decision = {
    action: 'skip',
    level: 'warn',
    message: `Ignoring stale ${event.type} for user ${userId}: row ends after event expiration`,
  }

  switch (event.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL': {
      if (!event.expiration_at_ms) {
        return { action: 'skip', level: 'warn', message: `Ignoring ${event.type} without expiration_at_ms for user ${userId}` }
      }

      // Eşit bitişte satır free ise olay iade/bitişten önceki teslimin tekrarıdır.
      if (stale || (existing?.plan === 'free' && existing.current_period_end !== null &&
        Date.parse(existing.current_period_end) === event.expiration_at_ms)) {
        return skipStale
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

    case 'CANCELLATION': {
      if (event.cancel_reason === 'CUSTOMER_SUPPORT') {
        // İade. Google Play erişimi kesmeden iade edebilir: bitiş gelecekteyse
        // Pro o tarihe kadar sürer, değilse hemen kapanır.
        if (!event.expiration_at_ms || event.expiration_at_ms <= nowMs) {
          return { action: 'update', patch: { plan: 'free', status: 'free', updated_at: nowIso } }
        }
        return {
          action: 'update',
          patch: {
            current_period_end: new Date(event.expiration_at_ms).toISOString(),
            cancel_at_period_end: true,
            cancelled_at: nowIso,
            updated_at: nowIso,
          },
        }
      }
      // İadeye sıra kontrolü yok: geç gelen iade de Pro'yu kapatmalı.
      if (stale) return skipStale
      return {
        action: 'update',
        patch: { cancel_at_period_end: true, cancelled_at: nowIso, updated_at: nowIso },
      }
    }

    // İptal edip dönem bitmeden geri alan kullanıcı. Denemede sık: kullanıcı
    // "unutmayayım" diye hemen iptal eder, sonra vazgeçer. App Store iadesi
    // geri alındığında da gelir; iade dalı free yazmış olabileceğinden dönem
    // sürüyorsa Pro geri yazılır.
    case 'UNCANCELLATION': {
      if (stale) return skipStale
      const plan = planFromProductId(event.product_id)
      if (plan && event.expiration_at_ms && event.expiration_at_ms > nowMs) {
        return {
          action: 'update',
          patch: {
            plan,
            status: plan,
            current_period_end: new Date(event.expiration_at_ms).toISOString(),
            cancel_at_period_end: false,
            cancelled_at: null,
            is_sandbox: event.environment === 'SANDBOX',
            updated_at: nowIso,
          },
        }
      }
      return { action: 'update', patch: { cancel_at_period_end: false, cancelled_at: null, updated_at: nowIso } }
    }

    // Dönem uzatıldı (destek/telafi): yalnız bitiş tarihi değişir.
    case 'SUBSCRIPTION_EXTENDED':
      if (!event.expiration_at_ms) {
        return { action: 'skip', level: 'warn', message: `Ignoring SUBSCRIPTION_EXTENDED without expiration_at_ms for user ${userId}` }
      }
      if (stale) return skipStale
      return {
        action: 'update',
        patch: { current_period_end: new Date(event.expiration_at_ms).toISOString(), updated_at: nowIso },
      }

    case 'EXPIRATION':
      if (stale) return skipStale
      return { action: 'update', patch: { plan: 'free', status: 'free', updated_at: nowIso } }

    default:
      // Diğer event tipleri (TEST, PRODUCT_CHANGE vb.): logla ve geç
      return { action: 'skip', level: 'log', message: `Unhandled RevenueCat event type: ${event.type} for user ${userId} via ${source}` }
  }
}
