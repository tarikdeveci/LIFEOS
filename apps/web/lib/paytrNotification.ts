// PayTR IPN iş mantığı (route.ts ince kalır, burası test edilir).
//
// PayTR sözleşmesi: bildirim yanıtı düz metin "OK" ise PayTR işlemi tamamlanmış sayar ve
// bir daha göndermez; OK dışı her yanıtta (4xx, 5xx, farklı gövde) bildirimi sonra tekrar dener.
// Bu yüzden ayrım şöyle:
//  - İmza/alan hatası: sahte ya da bozuk istek, tekrar denemenin anlamı yok -> 400.
//  - Bilinmeyen merchant_oid: kalıcı durum, tekrar denemek düzeltmez -> OK (loglanır).
//  - Veritabanı okuma/yazma hatası: geçici, tekrar denemeli -> 500 (OK DEĞİL). Eskiden
//    supabase-js `{ error }` döndürüp fırlatmadığı için hata yutulur ve OK dönerdi:
//    ödeme alınmış ama abonelik açılmamış kalırdı.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface PaytrIpn {
  merchantOid: string
  status: string
  totalAmount: string
  hash: string
  failedReasonCode?: string
}

/** Testte sahte nesne verilir (tests/web/paytrNotification.test.ts). */
export type PaytrDb = Pick<SupabaseClient, 'from'>

export interface PaytrDeps {
  db: PaytrDb
  verifyHash: (merchantOid: string, status: string, totalAmount: string, hash: string) => boolean
  netMonthlyUsd: (totalAmount: string, plan: 'pro_monthly' | 'pro_annual') => number | null
  now?: () => Date
}

export interface PaytrResult {
  status: number
  body: string
}

const OK: PaytrResult = { status: 200, body: 'OK' }
const INVALID: PaytrResult = { status: 400, body: 'PAYTR_IPN_INVALID' }
const RETRY: PaytrResult = { status: 500, body: 'PAYTR_IPN_RETRY' }

export async function handlePaytrNotification(ipn: PaytrIpn, deps: PaytrDeps): Promise<PaytrResult> {
  const { merchantOid, status, totalAmount, hash } = ipn
  if (!merchantOid || !status || !totalAmount || !hash) return INVALID
  if (!deps.verifyHash(merchantOid, status, totalAmount, hash)) {
    console.error('PayTR hash doğrulama başarısız:', { merchantOid })
    return INVALID
  }

  const { data: subscription, error: subError } = await deps.db
    .from('subscriptions')
    .select('user_id, plan')
    .eq('paytr_merchant_oid', merchantOid)
    .maybeSingle()
  if (subError) {
    console.error('PayTR abonelik okunamadı:', { merchantOid, message: subError.message })
    return RETRY
  }
  if (!subscription) {
    // Aynı kullanıcı ikinci bir ödeme başlattıysa subscriptions.paytr_merchant_oid ezilmiş
    // olabilir. Bu bilinen açık: nedeni KALAN_ADIMLAR'da. Tekrar denemek düzeltmez.
    console.error('Abonelik bulunamadı merchant_oid:', merchantOid)
    return OK
  }

  const outcome = status === 'success' ? 'success' : 'failure'

  // Çift bildirim: bu oid için aynı sonuç zaten yazıldıysa tekrar yazma.
  const { data: existing, error: existingError } = await deps.db
    .from('payment_history')
    .select('id')
    .eq('paytr_merchant_oid', merchantOid)
    .eq('status', outcome)
    .limit(1)
  if (existingError) {
    console.error('PayTR ödeme geçmişi okunamadı:', { merchantOid, message: existingError.message })
    return RETRY
  }
  if (existing && existing.length > 0) return OK

  const planKey = subscription.plan as 'pro_monthly' | 'pro_annual'
  const amount = parseFloat(totalAmount) / 100

  if (outcome === 'success') {
    const now = (deps.now ?? (() => new Date()))()
    const periodEnd = new Date(now)
    if (planKey === 'pro_annual') periodEnd.setFullYear(periodEnd.getFullYear() + 1)
    else periodEnd.setMonth(periodEnd.getMonth() + 1)
    const netMonthlyUsd = deps.netMonthlyUsd(totalAmount, planKey)

    // Önce abonelik: bu yazılamazsa geçmiş satırı da yazılmaz, tekrar deneme ikisini birlikte yapar.
    const { error: updateError } = await deps.db
      .from('subscriptions')
      .update({
        status: planKey,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false,
        cancelled_at: null,
        // Kur tanımlı değilse kolon hiç yazılmaz, mevcut değer korunur.
        ...(netMonthlyUsd === null ? {} : { net_monthly_usd: netMonthlyUsd }),
      })
      .eq('user_id', subscription.user_id)
    if (updateError) {
      console.error('PayTR abonelik güncellenemedi:', { merchantOid, message: updateError.message })
      return RETRY
    }
  }

  const { error: insertError } = await deps.db.from('payment_history').insert({
    user_id: subscription.user_id,
    amount,
    currency: 'TRY',
    status: outcome,
    paytr_merchant_oid: merchantOid,
    plan: planKey,
    description: outcome === 'success'
      ? `${planKey === 'pro_annual' ? 'Yıllık' : 'Aylık'} Pro abonelik`
      : 'Ödeme başarısız',
    ...(outcome === 'failure' ? { error_message: ipn.failedReasonCode } : {}),
  })
  if (insertError) {
    console.error('PayTR ödeme geçmişi yazılamadı:', { merchantOid, message: insertError.message })
    return RETRY
  }

  return OK
}
