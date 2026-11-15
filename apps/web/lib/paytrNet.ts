// PayTR ödemesinden aylık net gelir (USD): KDV ve PayTR komisyonu düşülür,
// yıllık plan 12'ye bölünür. AI bütçesi bunun payıdır (supabase/functions/_shared/ai/usage.ts).

const VAT_DIVISOR = 1.2
const DEFAULT_COMMISSION = 0.03

function positive(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

function commission(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_COMMISSION
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 && value < 1 ? value : DEFAULT_COMMISSION
}

/**
 * `totalAmountKurus` PayTR bildirimindeki `total_amount` (kuruş, tam sayı metni).
 * Kur yoksa ya da tutar bozuksa null döner; çağıran kolonu hiç yazmaz.
 */
export function paytrNetMonthlyUsd(
  totalAmountKurus: string,
  plan: 'pro_monthly' | 'pro_annual',
  env: { usdTry?: string; commissionPct?: string },
): number | null {
  const usdTry = positive(env.usdTry)
  const kurus = /^\d+$/.test(totalAmountKurus) ? Number(totalAmountKurus) : 0
  if (usdTry === null || kurus <= 0) return null
  const net = ((kurus / 100) / VAT_DIVISOR) * (1 - commission(env.commissionPct)) / usdTry
  // Sonlu olmayan değer JSON'da null olur ve mevcut değeri silerdi.
  if (!Number.isFinite(net)) return null
  return plan === 'pro_annual' ? net / 12 : net
}
