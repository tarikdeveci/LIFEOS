import { useCallback, useEffect, useState } from 'react'
import { getAiAllowance } from '@lifeos/shared/supabase'
import { supabase } from '@/src/lib/supabase'

/**
 * Free kullanıcının kalan ücretsiz AI planlama hakkı. Sayaç sunucuda
 * (`ai_allowance()`, migration 052); kapı da sunucuda uygulanıyor, burası
 * yalnızca göstermek ve kilidi doğru çizmek için.
 *
 * Pro kullanıcıda, abonelik durumu henüz yüklenmemişken ve sayaç okunamazsa
 * null döner. Çağıran taraf null'ı "hak yok" sayar: bugünkü davranış.
 */
export function useFreeAiPlans(isPro: boolean, isCheckingPro: boolean) {
  const [freePlansLeft, setFreePlansLeft] = useState<number | null>(null)

  const refreshFreePlans = useCallback(async () => {
    if (isPro || isCheckingPro) {
      setFreePlansLeft(null)
      return
    }
    try {
      setFreePlansLeft((await getAiAllowance(supabase)).freePlansLeft)
    } catch {
      setFreePlansLeft(null)
    }
  }, [isPro, isCheckingPro])

  useEffect(() => {
    void refreshFreePlans()
  }, [refreshFreePlans])

  return { freePlansLeft, refreshFreePlans }
}
