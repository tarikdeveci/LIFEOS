// Opsiyonel native modüller — expo prebuild + EAS Build sonrası kurulur.
// Bu tipler eksik modüllerden gelen TypeScript hatalarını önler.

declare module '@react-native-community/shared-preferences' {
  const SharedGroupPreferences: {
    setItem(key: string, value: string, groupName: string): Promise<void>
    getItem(key: string, groupName: string): Promise<string | null>
  }
  export default SharedGroupPreferences
}

declare module 'react-native-widgetkit' {
  export function reloadAllTimelines(): void
  export function reloadTimelines(ofKind: string): void
}

declare module 'react-native-shared-preferences' {
  const SharedPreferences: {
    setItem(key: string, value: string): void
    getItem(key: string, callback: (value: string | null) => void): void
  }
  export default SharedPreferences
}

declare module 'react-native-purchases' {
  interface CustomerInfo {
    entitlements: {
      active: Record<string, unknown>
    }
  }
  const Purchases: {
    configure(config: { apiKey: string }): Promise<void>
    logIn(userId: string): Promise<{ customerInfo: CustomerInfo }>
    getCustomerInfo(): Promise<CustomerInfo>
    setLogLevel(level: number): void
  }
  export const LOG_LEVEL: { DEBUG: number; INFO: number; WARN: number }
  export default Purchases
}

declare module 'react-native-purchases-ui' {
  export const PAYWALL_RESULT: {
    PURCHASED: string
    RESTORED: string
    NOT_PRESENTED: string
    ERROR: string
    CANCELLED: string
  }
  const RevenueCatUI: {
    presentPaywall(options?: object): Promise<string>
    presentPaywallIfNeeded(options: { requiredEntitlementIdentifier: string }): Promise<string>
  }
  export default RevenueCatUI
}
