import { useEffect, useState } from 'react'
import { subscribeUserRealtime } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'

/**
 * Öteki cihazdaki değişiklikler (görev, blok, öğün, rutin, hedef) açık ekrana yansır.
 * Tabs layout'ta bir kez mount edilir; oturum değişince kanal yeniden kurulur.
 */
export function useRealtimeSync(): void {
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!userId) return
    return subscribeUserRealtime(supabase, userId)
  }, [userId])
}
