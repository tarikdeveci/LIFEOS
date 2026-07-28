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

// Store urun kimlikleri. App Store Connect'te PRO grubu altinda tanimli;
// Play tarafinda ayni kimliklerle olusturulmali.
export const PRO_PRODUCT_IDS = { monthly: 'PRO_1', annual: 'PRO_2' } as const

export type ProPeriod = 'monthly' | 'annual'

export interface ProPlan {
  period: ProPeriod
  productId: string
  priceString: string
  /** RevenueCat paketi — offering tanimliysa dolu, getProducts fallback'inde null */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pkg: any | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  product: any
}

function periodOf(productId: string): ProPeriod | null {
  if (productId === PRO_PRODUCT_IDS.monthly) return 'monthly'
  if (productId === PRO_PRODUCT_IDS.annual) return 'annual'
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
      if (period) plans.push({ period, productId: pkg.product.identifier, priceString: pkg.product.priceString, pkg, product: pkg.product })
    }
  } catch {
    // offering okunamadi — asagidaki fallback devreye girer
  }

  if (plans.length === 0) {
    try {
      const products = await Purchases.getProducts([PRO_PRODUCT_IDS.monthly, PRO_PRODUCT_IDS.annual])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const product of (products ?? []) as any[]) {
        const period = periodOf(product.identifier)
        if (period) plans.push({ period, productId: product.identifier, priceString: product.priceString, pkg: null, product })
      }
    } catch {
      return []
    }
  }

  // Aylik once, yillik sonra
  return plans.sort((a, b) => (a.period === 'monthly' ? -1 : 1) - (b.period === 'monthly' ? -1 : 1))
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
