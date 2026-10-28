// supabase/functions/revenuecat-webhook/index.ts
// RevenueCat → Supabase subscriptions tablosunu günceller.
// Dashboard: RevenueCat → Integrations → Webhooks → URL: https://<project>.supabase.co/functions/v1/revenuecat-webhook
// Authorization header secret → Supabase Dashboard → Edge Functions → Secrets → REVENUECAT_WEBHOOK_SECRET
// Event → satır kararı saf modülde: ./decide.ts (tests/functions/revenuecatWebhook.test.ts)

import { createClient } from 'npm:@supabase/supabase-js@2'

import { decideRow, type ExistingRow, type RevenueCatEvent } from './decide.ts'
import { DEFAULT_NET_RATES, envRate, type NetRates } from './net.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// Olayda vergi ya da mağaza payı oranı yoksa kullanılır.
const NET_RATES: NetRates = {
  tax: envRate(Deno.env.get('AI_DEFAULT_TAX_PCT'), DEFAULT_NET_RATES.tax),
  commission: envRate(Deno.env.get('AI_DEFAULT_COMMISSION_PCT'), DEFAULT_NET_RATES.commission),
}

interface RevenueCatPayload {
  event: RevenueCatEvent
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

  // Purchases.logIn'den önce yapılan işlem '$RCAnonymousID:...' ile gelir.
  // Yazılacak satır yok; 500 dönersek RevenueCat boşuna yeniden dener.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId ?? '')) {
    console.warn(`Ignoring ${event.type}: app_user_id bir Supabase kullanıcısı değil (${userId})`)
    return new Response('OK', { status: 200 })
  }

  // Karar mevcut satıra bakar: sırasız gelen eski olay ve sandbox olayı
  // süren aboneliği ezmesin (decide.ts).
  const { data: existing, error: readError } = await supabase
    .from('subscriptions')
    .select('plan, current_period_end, is_sandbox')
    .eq('user_id', userId)
    .maybeSingle()
  if (readError) return dbFailure(event.type, userId, readError.message)

  const decision = decideRow(event, new Date(), existing as ExistingRow | null, NET_RATES)

  switch (decision.action) {
    case 'skip':
      console[decision.level](decision.message)
      break
    case 'upsert': {
      const { error } = await supabase.from('subscriptions').upsert(decision.row, { onConflict: 'user_id' })
      if (error) return dbFailure(event.type, userId, error.message)
      break
    }
    case 'update': {
      let query = supabase.from('subscriptions').update(decision.patch).eq('user_id', userId)
      // Okuma ile yazma arasında gelen yenileme bitişi ileri attıysa eski olay yazılmaz.
      if (decision.maxEnd) query = query.or(`current_period_end.is.null,current_period_end.lte.${decision.maxEnd}`)
      const { error } = await query
      if (error) return dbFailure(event.type, userId, error.message)
      break
    }
  }

  return new Response('OK', { status: 200 })
})
