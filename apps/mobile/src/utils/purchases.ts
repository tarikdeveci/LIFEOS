import { Platform } from 'react-native'

// react-native-purchases EAS Build ile çalışır; Expo Go'da mock modda.
// Kurulum: expo install react-native-purchases react-native-purchases-ui
// app.json plugin: ["react-native-purchases", { "androidPublicKey": "..." }]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPurchases(): Promise<any> {
  const mod = await import('react-native-purchases').catch(() => null)
  return mod?.default ?? null
}

let revenueCatConfigured = false
let revenueCatUserId: string | null = null

export async function initRevenueCat(userId: string): Promise<void> {
  const Purchases = await getPurchases()
  if (!Purchases) return

  const apiKey =
    Platform.OS === 'ios'
      ? process.env['EXPO_PUBLIC_REVENUECAT_IOS_KEY']
      : process.env['EXPO_PUBLIC_REVENUECAT_ANDROID_KEY']

  if (!apiKey) return

  if (!revenueCatConfigured) {
    await Purchases.configure({ apiKey })
    revenueCatConfigured = true
  }

  if (revenueCatUserId !== userId) {
    await Purchases.logIn(userId)
    revenueCatUserId = userId
  }
}

export async function getCustomerInfo() {
  const Purchases = await getPurchases()
  if (!Purchases) return null
  return Purchases.getCustomerInfo()
}

export async function isPro(): Promise<boolean> {
  const info = await getCustomerInfo()
  if (!info) return false
  return info.entitlements.active['pro'] !== undefined
}

// Store urun kimlikleri.
//
// App Store'da PRO_1 / PRO_2, Play'de pro_1 / pro_2 — Play buyuk harfe izin
// vermiyor ("Subscription ID is malformed"), o yuzden kimlikler magazalar
// arasinda birebir ayni olamiyor. Karsilastirmalar bu yuzden buyuk/kucuk harf
// duyarsiz yapilir.
export const PRO_PRODUCT_IDS = { monthly: 'PRO_1', annual: 'PRO_2' } as const

/** getProducts fallback'i icin her iki magazanin yazimi */
const PRODUCT_ID_VARIANTS = [
  PRO_PRODUCT_IDS.monthly,
  PRO_PRODUCT_IDS.annual,
  PRO_PRODUCT_IDS.monthly.toLowerCase(),
  PRO_PRODUCT_IDS.annual.toLowerCase(),
]

export type ProPeriod = 'monthly' | 'annual'

/**
 * Mağazanın ücretsiz deneme teklifi (ASC'de introductory offer, Play'de free
 * trial fazı). Hafta gün olarak tutulur: "1 hafta" yerine "7 gün" yazılıyor.
 */
export interface TrialOffer {
  count: number
  unit: 'day' | 'month' | 'year'
}

export interface ProPlan {
  period: ProPeriod
  productId: string
  priceString: string
  /** Bu kullanıcının alabileceği ücretsiz deneme; yoksa ya da uygun değilse null */
  trial: TrialOffer | null
  /** RevenueCat paketi — offering tanimliysa dolu, getProducts fallback'inde null */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pkg: any | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  product: any
}

function periodOf(productId: string): ProPeriod | null {
  // Play'de kimlik "pro_1:monthly" gibi productId:basePlanId biçiminde gelir,
  // App Store'da yalnızca "PRO_1". Base plan ekini atıp harf duyarsız
  // karşılaştırıyoruz — tam eşleşme aramak Android'de hiçbir planı tanımıyordu.
  const base = productId.split(':')[0]?.toLowerCase()
  if (base === PRO_PRODUCT_IDS.monthly.toLowerCase()) return 'monthly'
  if (base === PRO_PRODUCT_IDS.annual.toLowerCase()) return 'annual'
  return null
}

/**
 * Satin alinabilir Pro planlarini getirir.
 * Once RevenueCat offering'i denenir; offering tanimli degilse urunler
 * dogrudan store'dan cekilir, boylece panel konfigurasyonu eksikse de paywall calisir.
 */
export async function fetchProPlans(): Promise<ProPlan[]> {
  const Purchases = await getPurchases()
  if (!Purchases) return []

  const plans: ProPlan[] = []

  try {
    const offerings = await Purchases.getOfferings()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const pkg of (offerings?.current?.availablePackages ?? []) as any[]) {
      const period = periodOf(pkg.product.identifier)
      if (period) plans.push({ period, productId: pkg.product.identifier, priceString: pkg.product.priceString, trial: null, pkg, product: pkg.product })
    }
  } catch {
    // offering okunamadi — asagidaki fallback devreye girer
  }

  if (plans.length === 0) {
    try {
      const products = await Purchases.getProducts(PRODUCT_ID_VARIANTS)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const product of (products ?? []) as any[]) {
        const period = periodOf(product.identifier)
        if (period) plans.push({ period, productId: product.identifier, priceString: product.priceString, trial: null, pkg: null, product })
      }
    } catch {
      return []
    }
  }

  const eligible = await trialEligibleIds(Purchases, plans.map((p) => p.productId))
  for (const plan of plans) {
    plan.trial = eligible.has(plan.productId) ? trialFromProduct(plan.product) : null
  }

  // Aylik once, yillik sonra
  return plans.sort((a, b) => (a.period === 'monthly' ? -1 : 1) - (b.period === 'monthly' ? -1 : 1))
}

/** Yalnızca ÜCRETSİZ deneme; indirimli giriş fiyatı deneme sayılmaz. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function trialFromProduct(product: any): TrialOffer | null {
  const intro = product?.introPrice
  if (!intro || Number(intro.price) !== 0) return null
  const units = Number(intro.periodNumberOfUnits) * Math.max(1, Number(intro.cycles) || 1)
  if (!Number.isFinite(units) || units <= 0) return null
  switch (String(intro.periodUnit).toUpperCase()) {
    case 'DAY': return { count: units, unit: 'day' }
    case 'WEEK': return { count: units * 7, unit: 'day' }
    case 'MONTH': return { count: units, unit: 'month' }
    case 'YEAR': return { count: units, unit: 'year' }
    default: return null
  }
}

/**
 * Denemeyi alabilecek ürünler.
 *
 * iOS: aynı abonelik grubunda daha önce deneme kullanan kullanıcı tekrar
 * alamaz; RevenueCat'e sorulur ve yalnızca ELIGIBLE kabul edilir. Emin
 * olunamıyorsa deneme gösterilmez: "ücretsiz" yazıp ilk gün ücret almak
 * yanıltıcı olur (RevenueCat'in önerisi de bu).
 *
 * Android: Play yalnızca kullanıcının hak kazandığı teklifleri döndürüyor ve
 * RevenueCat'in uygunluk sorgusu orada hep UNKNOWN. Üründe deneme fazı
 * görünüyorsa kullanıcı uygundur.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function trialEligibleIds(Purchases: any, productIds: string[]): Promise<Set<string>> {
  if (Platform.OS !== 'ios') return new Set(productIds)
  if (productIds.length === 0) return new Set()
  try {
    const eligibleStatus = Purchases.INTRO_ELIGIBILITY_STATUS?.INTRO_ELIGIBILITY_STATUS_ELIGIBLE ?? 2
    const result = await Purchases.checkTrialOrIntroductoryPriceEligibility(productIds)
    return new Set(productIds.filter((id) => result?.[id]?.status === eligibleStatus))
  } catch {
    return new Set()
  }
}

export type PurchaseOutcome = 'purchased' | 'cancelled' | 'unavailable' | 'error'

export async function purchasePlan(plan: ProPlan): Promise<PurchaseOutcome> {
  const Purchases = await getPurchases()
  if (!Purchases) return 'unavailable'

  try {
    if (plan.pkg) await Purchases.purchasePackage(plan.pkg)
    else await Purchases.purchaseStoreProduct(plan.product)
    return 'purchased'
  } catch (error) {
    if ((error as { userCancelled?: boolean })?.userCancelled) return 'cancelled'
    return 'error'
  }
}

export type RestoreOutcome = 'restored' | 'nothing' | 'unavailable' | 'error'

export async function restorePurchases(): Promise<RestoreOutcome> {
  const Purchases = await getPurchases()
  if (!Purchases) return 'unavailable'

  try {
    const info = await Purchases.restorePurchases()
    return info?.entitlements?.active?.['pro'] !== undefined ? 'restored' : 'nothing'
  } catch {
    return 'error'
  }
}

export async function presentPaywall(): Promise<'purchased' | 'restored' | 'cancelled' | 'error'> {
  try {
    const mod = await import('react-native-purchases-ui').catch(() => null)
    if (!mod) return 'error'

    const { PAYWALL_RESULT } = mod
    const result = await mod.default.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: 'pro',
    })

    if (result === PAYWALL_RESULT.PURCHASED) return 'purchased'
    if (result === PAYWALL_RESULT.RESTORED) return 'restored'
    return 'cancelled'
  } catch {
    return 'error'
  }
}
