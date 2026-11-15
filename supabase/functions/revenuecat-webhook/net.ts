// RevenueCat işleminden aylık net gelir (USD): vergi ve mağaza payı düşülür,
// yıllık plan 12'ye bölünür. AI bütçesi bunun payıdır (_shared/ai/usage.ts).

export interface NetRates {
  tax: number
  commission: number
}

/** Olayda oran yoksa kullanılır: TR KDV %20 fiyatın içinde (0,2 / 1,2), mağaza payı %15. */
export const DEFAULT_NET_RATES: NetRates = { tax: 0.167, commission: 0.15 }

function rate(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback
}

/**
 * Denemede fiyat 0, iadede negatif, bilinmiyorsa null gelir: hepsinde null
 * döner ve satırdaki mevcut değer korunur. Fiyat geçerli ama kesintiler
 * hepsini götürüyorsa 0 döner (bütçe varsayılana düşer, eski değer kalmaz).
 */
export function netMonthlyUsd(
  event: { price?: number | null; tax_percentage?: number | null; commission_percentage?: number | null },
  plan: 'pro_monthly' | 'pro_annual',
  defaults: NetRates = DEFAULT_NET_RATES,
): number | null {
  const price = event.price
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return null
  const net = price * (1 - rate(event.tax_percentage, defaults.tax) - rate(event.commission_percentage, defaults.commission))
  if (net <= 0) return 0
  return plan === 'pro_annual' ? net / 12 : net
}

/** Ortam değişkeninden oran; geçersizse varsayılan. */
export function envRate(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback
  return rate(Number(raw), fallback)
}
