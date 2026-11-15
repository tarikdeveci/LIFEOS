// Geri davranışının saf kuralları: dönülecek geçmiş yoksa nereye gidilir, kenardan
// kaydırma hangi ekranda çalışır. Yeni ekran eklenince yalnız bu dosyaya bakılır.

const NO_SWIPE_ROUTES = [
  '/',
  '/today',
  '/planning',
  '/tasks',
  '/nutrition',
  '/workout',
  '/login',
  '/register',
  '/reset-password',
  '/onboarding',
  '/paywall',
]

function isUnder(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`)
}

/** Geçmiş yokken (bildirimden, bağlantıdan soğuk açılış) ekranın mantıksal üstü. */
export function backFallback(pathname: string): string {
  if (pathname === '/register' || pathname === '/reset-password') return '/(auth)/login'
  if (pathname.startsWith('/settings/')) return '/(tabs)/settings'
  if (pathname.startsWith('/integrations/')) return '/(tabs)/settings/integrations'
  if (isUnder(pathname, '/exercise')) return '/(tabs)/workout'
  if (isUnder(pathname, '/task')) return '/(tabs)/tasks'
  return '/(tabs)/today'
}

/**
 * iOS'ta Stack ekranlarının kendi kaydırması var, ikinci kez geri gitmesin diye orada
 * yalnız Tabs içindeki alt sayfalar bizden gelir. Ana sekmelerde kaydırma sekme
 * geçmişinde gezdirirdi; giriş ve satın alma akışında da geri beklenmez.
 */
export function swipeBackEnabled(pathname: string, os: string): boolean {
  if (NO_SWIPE_ROUTES.includes(pathname)) return false
  if (os === 'ios') return isUnder(pathname, '/profile') || isUnder(pathname, '/settings')
  return true
}
