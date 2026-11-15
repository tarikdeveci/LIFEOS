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
export type PaytrDb = Pick<SupabaseClient, 'from' | 'rpc'>

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

  const { data: payment, error: pError } = await deps.db
    .from('payment_history')
    .select('plan')
    .eq('paytr_merchant_oid', merchantOid)
    .maybeSingle()
  if (pError) {
    console.error('PayTR ödeme geçmişi okunamadı:', { merchantOid, message: pError.message })
    return RETRY
  }
  if (!payment) {
    console.error('Abonelik bulunamadı merchant_oid:', merchantOid)
    return OK
  }

  const outcome = status === 'success' ? 'success' : 'failure'
  const planKey = payment.plan as 'pro_monthly' | 'pro_annual'
  const amount = parseFloat(totalAmount) / 100
  let netMonthlyUsd: number | null = null

  if (outcome === 'success') {
    netMonthlyUsd = deps.netMonthlyUsd(totalAmount, planKey)
  }

  const { data: rpcResult, error: rpcError } = await deps.db.rpc('paytr_settle_payment', {
    p_oid: merchantOid,
    p_status: outcome,
    p_amount: amount,
    p_error_message: ipn.failedReasonCode || null,
    p_net_monthly_usd: netMonthlyUsd
  })

  if (rpcError) {
    console.error('PayTR RPC hatası:', { merchantOid, message: rpcError.message })
    return RETRY
  }

  if (rpcResult === 'not_found') {
    console.error('Abonelik bulunamadı (RPC) merchant_oid:', merchantOid)
    return OK
  }

  return OK
}
