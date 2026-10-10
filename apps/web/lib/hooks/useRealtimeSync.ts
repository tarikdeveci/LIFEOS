'use client'

import { useEffect } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { subscribeUserRealtime } from '@lifeos/shared'

/**
 * Supabase Realtime aboneliği: görev, blok, öğün, rutin ve hedef değişiklikleri
 * store'lara yansır. Kullanıcının kendi verisi (RLS).
 */
export function useRealtimeSync(supabase: SupabaseClient, userId: string | null) {
  useEffect(() => {
    if (!userId) return
    return subscribeUserRealtime(supabase, userId)
  }, [supabase, userId])
}
