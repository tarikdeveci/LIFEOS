// supabase/functions/revenuecat-webhook/index.ts
// RevenueCat → Supabase subscriptions tablosunu günceller.
// Dashboard: RevenueCat → Integrations → Webhooks → URL: https://<project>.supabase.co/functions/v1/revenuecat-webhook
// Authorization header secret → Supabase Dashboard → Edge Functions → Secrets → REVENUECAT_WEBHOOK_SECRET

import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

interface RevenueCatEvent {
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
}

interface RevenueCatPayload {
  event: RevenueCatEvent
}

function mapStore(store: string | undefined): string {
  if (store === 'APP_STORE') return 'app_store'
  if (store === 'PLAY_STORE') return 'play_store'
  return store?.toLowerCase() ?? 'unknown'
}

// Ürün ID'sinden planı çöz. App Store: PRO_1/PRO_2, Play: pro_1/pro_2.
// Bilinmeyen ürün gelirse aylığa düşmek yanlış olur (yıllık ödeyen aylık görünür),
// o yüzden null dönüp event'i atlıyoruz — sessizce yanlış veri yazmaktansa loglayalım.
function planFromProductId(productId: string | undefined): 'pro_monthly' | 'pro_annual' | null {
  if (!productId) return null
  // Play, ürün kimliğini "PRO_1:aylik" gibi productId:basePlanId biçiminde
  // gönderebiliyor; App Store yalnızca "PRO_1". Tam eşleşme aramak Play
  // satın almalarında null dönüp event'in sessizce atlanmasına yol açardı.
  const id = productId.toLowerCase().split(':')[0]
  if (id === 'pro_1') return 'pro_monthly'
  if (id === 'pro_2') return 'pro_annual'
  return null
}

const PERIOD_TYPES = new Set(['trial', 'intro', 'normal', 'promotional', 'prepaid'])

/** RevenueCat dönem tipi ('TRIAL', 'NORMAL', ...) küçük harfle; bilinmeyen değer null. */
function normalizePeriodType(value: string | undefined): string | null {
  const lower = value?.toLowerCase() ?? ''
  return PERIOD_TYPES.has(lower) ? lower : null
}

/**
 * Yazım hatası RevenueCat'e 500 olarak döner: RevenueCat 200 dışındaki her
 * yanıtı yeniden dener. Eskiden hata yok sayılıp 200 dönülüyordu; satır
 * yazılamazsa satın alan kullanıcı sessizce free kalıyordu.
 */
function dbFailure(eventType: string, userId: string, message: string): Response {
  console.error(`${eventType} yazılamadı (user ${userId}): ${message}`)
  return new Response('Database write failed', { status: 500 })
}

Deno.serve(async (req) => {
  // Bu fonksiyon verify_jwt=false ile deploy edilir (config.toml): RevenueCat
  // Supabase JWT'si üretemez, header'a bizim verdiğimiz secret'ı koyar. Yani
  // Supabase'in kapısı devre dışı — tek koruma buradaki karşılaştırma.
  //
  // Bu yüzden secret YOKSA fail-closed davranıyoruz. Eskiden `if (expectedSecret
  // && ...)` yazıyordu; secret tanımsızken kontrol tamamen atlanıyor, endpoint
  // herkese açık kalıyordu — sahte INITIAL_PURCHASE ile kendine Pro yazmak
  // mümkündü.
  const expectedSecret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET')
  if (!expectedSecret) {
    console.error('REVENUECAT_WEBHOOK_SECRET tanımlı değil — tüm istekler reddediliyor')
    return new Response('Server misconfigured', { status: 500 })
  }

  const authHeader = req.headers.get('Authorization')
  if (authHeader !== expectedSecret) {
    return new Response('Unauthorized', { status: 401 })
  }

  let payload: RevenueCatPayload
  try {
    payload = (await req.json()) as RevenueCatPayload
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const { event } = payload
  const userId = event.app_user_id // Supabase user ID ile eşleştirilmiş olmalı
  const source = mapStore(event.store)

  // Purchases.logIn'den önce yapılan işlem '$RCAnonymousID:...' ile gelir.
  // Yazılacak satır yok; 500 dönersek RevenueCat boşuna yeniden dener.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId ?? '')) {
    console.warn(`Ignoring ${event.type}: app_user_id bir Supabase kullanıcısı değil (${userId})`)
    return new Response('OK', { status: 200 })
  }

  const now = new Date()

  switch (event.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL': {
      if (!event.expiration_at_ms) {
        console.warn(`Ignoring ${event.type} without expiration_at_ms for user ${userId}`)
        break
      }

      const plan = planFromProductId(event.product_id)
      if (!plan) {
        console.error(
          `Ignoring ${event.type} for user ${userId}: unknown product_id "${event.product_id}" via ${source}`,
        )
        break
      }

      const periodType = normalizePeriodType(event.period_type)
      const periodStart = event.purchased_at_ms
        ? new Date(event.purchased_at_ms).toISOString()
        : now.toISOString()
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
        updated_at: now.toISOString(),
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
      if (event.is_trial_conversion === true) row['trial_converted_at'] = now.toISOString()

      // AI bütçesi ödenen fiyatla ölçekleniyor. Denemede fiyat 0 geliyor;
      // 0 ile ezersek dönüşümden sonra bütçe tabana düşer.
      if (typeof event.price === 'number' && event.price > 0) row['price_usd'] = event.price

      const { error } = await supabase.from('subscriptions').upsert(row, { onConflict: 'user_id' })
      if (error) return dbFailure(event.type, userId, error.message)
      break
    }

    case 'CANCELLATION': {
      const { error } = await supabase
        .from('subscriptions')
        .update({ cancel_at_period_end: true, cancelled_at: now.toISOString(), updated_at: now.toISOString() })
        .eq('user_id', userId)
      if (error) return dbFailure(event.type, userId, error.message)
      break
    }

    // İptal edip dönem bitmeden geri alan kullanıcı. Denemede sık: kullanıcı
    // "unutmayayım" diye hemen iptal eder, sonra vazgeçer.
    case 'UNCANCELLATION': {
      const { error } = await supabase
        .from('subscriptions')
        .update({ cancel_at_period_end: false, cancelled_at: null, updated_at: now.toISOString() })
        .eq('user_id', userId)
      if (error) return dbFailure(event.type, userId, error.message)
      break
    }

    case 'EXPIRATION': {
      const { error } = await supabase
        .from('subscriptions')
        .update({ plan: 'free', status: 'free', updated_at: now.toISOString() })
        .eq('user_id', userId)
      if (error) return dbFailure(event.type, userId, error.message)
      break
    }

    default:
      // Diğer event tipleri (TEST, PRODUCT_CHANGE vb.) — logla ve geç
      console.log(`Unhandled RevenueCat event type: ${event.type} for user ${userId} via ${source}`)
  }

  return new Response('OK', { status: 200 })
})
