import { useCallback } from 'react'
import { router, usePathname } from 'expo-router'
import { backFallback } from './backRoutes'

/** Ekranın açıldığı yere döner; geçmiş yoksa mantıksal üst ekrana gider. */
export function useGoBack(): () => void {
  const pathname = usePathname()
  return useCallback(() => {
    if (router.canGoBack()) router.back()
    else router.replace(backFallback(pathname) as never)
  }, [pathname])
}
