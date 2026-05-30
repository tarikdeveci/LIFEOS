import { Platform } from 'react-native'

// react-native-purchases EAS Build ile çalışır; Expo Go'da mock modda.
// Kurulum: expo install react-native-purchases react-native-purchases-ui
// app.json plugin: ["react-native-purchases", { "androidPublicKey": "..." }]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPurchases(): Promise<any> {
  const mod = await import('react-native-purchases').catch(() => null)
  return mod?.default ?? null
}

export async function initRevenueCat(userId: string): Promise<void> {
  const Purchases = await getPurchases()
  if (!Purchases) return

  const apiKey =
    Platform.OS === 'ios'
      ? process.env['EXPO_PUBLIC_REVENUECAT_IOS_KEY']
      : process.env['EXPO_PUBLIC_REVENUECAT_ANDROID_KEY']

  if (!apiKey) return

  await Purchases.configure({ apiKey })
  await Purchases.logIn(userId)
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
