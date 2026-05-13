'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

/**
 * Supabase auth state hook.
 * Authenticated user'ın id ve metadata'sını sağlar.
 */
export function useAuth() {
  const [user, setUser] = useState<{
    id: string
    email: string | undefined
    displayName: string | null
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // İlk yükleme
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      if (u) {
        setUser({
          id: u.id,
          email: u.email,
          displayName: (u.user_metadata?.['display_name'] as string) ?? null,
        })
      }
      setLoading(false)
    })

    // Auth state değişikliklerini dinle
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email,
          displayName: (session.user.user_metadata?.['display_name'] as string) ?? null,
        })
      } else {
        setUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return { user, loading }
}
