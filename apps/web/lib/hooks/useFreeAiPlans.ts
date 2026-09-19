'use client'

import { useCallback, useEffect, useState } from 'react'
import { getAiAllowance } from '@lifeos/shared/supabase'
import { supabase } from '@/lib/supabase/client'

/**
 * Free kullanıcının kalan ücretsiz AI planlama hakkı (mobildeki aynı hook'un
 * web karşılığı). Kapı sunucuda uygulanıyor; burası yalnızca göstermek için.
 *
 * Pro kullanıcıda, abonelik durumu yüklenirken ve sayaç okunamazsa null döner.
 * null "bilinmiyor" demek: arayüz göndermeyi engellemez, kararı sunucu verir.
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
