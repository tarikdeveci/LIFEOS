import { Redirect, type Href } from 'expo-router'

/**
 * OAuth dönüşü (lifeos://integrations/<sağlayıcı>?status=...). Sonucu openAuthSessionAsync
 * zaten okuyor; Android bağlantıyı uygulamaya da ilettiğinde "eşleşmeyen rota" yerine
 * Entegrasyonlar ekranı açılsın.
 */
export default function IntegrationReturn() {
  // Tipli rota listesi expo start ile yenilenir; ekran yeni olduğu için henüz listede değil.
  return <Redirect href={'/(tabs)/settings/integrations' as Href} />
}
