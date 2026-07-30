// Opsiyonel native modüller — expo prebuild + EAS Build sonrası kurulur.
// Bu tipler eksik modüllerden gelen TypeScript hatalarını önler.

declare module 'react-native-purchases' {
  interface CustomerInfo {
    entitlements: {
      active: Record<string, unknown>
    }
  }
  interface PurchasesStoreProduct {
    identifier: string
    title: string
    description: string
    price: number
    priceString: string
    currencyCode: string
  }
  interface PurchasesPackage {
    identifier: string
    packageType: string
    product: PurchasesStoreProduct
  }
  interface PurchasesOffering {
    identifier: string
    availablePackages: PurchasesPackage[]
  }
  interface PurchasesOfferings {
    current: PurchasesOffering | null
    all: Record<string, PurchasesOffering>
  }
  const Purchases: {
    configure(config: { apiKey: string }): Promise<void>
    logIn(userId: string): Promise<{ customerInfo: CustomerInfo }>
    getCustomerInfo(): Promise<CustomerInfo>
    setLogLevel(level: number): void
    getOfferings(): Promise<PurchasesOfferings>
    getProducts(productIdentifiers: string[]): Promise<PurchasesStoreProduct[]>
    purchasePackage(pkg: PurchasesPackage): Promise<{ customerInfo: CustomerInfo; productIdentifier: string }>
    purchaseStoreProduct(product: PurchasesStoreProduct): Promise<{ customerInfo: CustomerInfo; productIdentifier: string }>
    restorePurchases(): Promise<CustomerInfo>
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
