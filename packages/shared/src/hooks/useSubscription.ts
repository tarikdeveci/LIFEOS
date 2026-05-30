import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface SubscriptionState {
  isPro: boolean
  plan: string
  status: string
  periodEnd: string | null
  isLoading: boolean
}

export function useSubscription(supabase: SupabaseClient, userId: string | null): SubscriptionState {
  const [state, setState] = useState<SubscriptionState>({
    isPro: false,
    plan: 'free',
    status: 'free',
    periodEnd: null,
    isLoading: true,
  })

  useEffect(() => {
    if (!userId) {
      setState((s) => ({ ...s, isLoading: false }))
      return
    }

    // İlk yükleme
    supabase
      .from('subscriptions')
      .select('plan, status, current_period_end')
      .eq('user_id', userId)
      .single()
      .then(({ data }) => {
        const active = data?.status === 'pro_monthly' || data?.status === 'pro_annual'
        const periodEnd = (data?.current_period_end as string | null) ?? null
        const notExpired = !periodEnd || new Date(periodEnd) > new Date()
        setState({
          isPro: active && notExpired,
          plan: (data?.plan as string) ?? 'free',
          status: (data?.status as string) ?? 'free',
          periodEnd,
          isLoading: false,
        })
      })

    // Realtime: webhook güncellemelerini yakala
    const channel = supabase
      .channel(`subscription-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'subscriptions',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          const active = row['status'] === 'pro_monthly' || row['status'] === 'pro_annual'
          const periodEnd = (row['current_period_end'] as string | null) ?? null
          const notExpired = !periodEnd || new Date(periodEnd) > new Date()
          setState({
            isPro: active && notExpired,
            plan: (row['plan'] as string) ?? 'free',
            status: (row['status'] as string) ?? 'free',
            periodEnd,
            isLoading: false,
          })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, userId])

  return state
}
