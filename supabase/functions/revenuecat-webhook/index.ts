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
  const id = productId.toLowerCase()
  if (id === 'pro_1') return 'pro_monthly'
  if (id === 'pro_2') return 'pro_annual'
  return null
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

      await supabase.from('subscriptions').upsert(
        {
          user_id: userId,
          plan,
          status: plan,
          iyzico_subscription_reference_code: event.original_transaction_id ?? null,
          current_period_start: event.purchased_at_ms
            ? new Date(event.purchased_at_ms).toISOString()
            : now.toISOString(),
          current_period_end: new Date(event.expiration_at_ms).toISOString(),
          updated_at: now.toISOString(),
        },
        { onConflict: 'user_id' },
      )
      break
    }

    case 'CANCELLATION': {
      await supabase
        .from('subscriptions')
        .update({ cancel_at_period_end: true, cancelled_at: now.toISOString(), updated_at: now.toISOString() })
        .eq('user_id', userId)
      break
    }

    case 'EXPIRATION': {
      await supabase
        .from('subscriptions')
        .update({ plan: 'free', status: 'free', updated_at: now.toISOString() })
        .eq('user_id', userId)
      break
    }

    default:
      // Diğer event tipleri (TEST, PRODUCT_CHANGE vb.) — logla ve geç
      console.log(`Unhandled RevenueCat event type: ${event.type} for user ${userId} via ${source}`)
  }

  return new Response('OK', { status: 200 })
})
