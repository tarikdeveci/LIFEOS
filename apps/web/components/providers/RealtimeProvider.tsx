'use client'

import { useRealtimeSync } from '@/lib/hooks/useRealtimeSync'
import { useAuth } from '@/lib/hooks/useAuth'
import { supabase } from '@/lib/supabase/client'

/**
 * Dashboard layout'a eklenen client provider.
 * Realtime sync'i başlatır.
 */
export default function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()

  useRealtimeSync(supabase, user?.id ?? null)

  return <>{children}</>
}
