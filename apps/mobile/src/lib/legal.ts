import * as WebBrowser from 'expo-web-browser'

// Yasal sayfalar lifeos.tr'de (apps/web/app/(legal)). Kayıt, paywall, profil ve ayarlar aynı adresi kullanır.
export const PRIVACY_URL = 'https://lifeos.tr/gizlilik-kvkk'
export const SALES_TERMS_URL = 'https://lifeos.tr/mesafeli-satis-sozlesmesi'

/** Uygulama içi tarayıcıda açar; kullanıcı kayıt veya satın alma akışından kopmaz. */
export function openLegalPage(url: string): void {
  void WebBrowser.openBrowserAsync(url)
}
