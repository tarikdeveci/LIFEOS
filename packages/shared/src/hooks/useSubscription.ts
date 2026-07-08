import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface SubscriptionState {
  isPro: boolean
  plan: string
  status: string
  periodEnd: string | null
  isLoading: boolean
}

function stateFromRow(row: Record<string, unknown> | null | undefined): SubscriptionState {
  const active = row?.['status'] === 'pro_monthly' || row?.['status'] === 'pro_annual'
  const periodEnd = (row?.['current_period_end'] as string | null) ?? null
  const notExpired = periodEnd !== null && new Date(periodEnd) > new Date()

  return {
    isPro: active && notExpired,
    plan: (row?.['plan'] as string) ?? 'free',
    status: (row?.['status'] as string) ?? 'free',
    periodEnd,
    isLoading: false,
  }
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

    supabase
      .from('subscriptions')
      .select('plan, status, current_period_end')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        setState(stateFromRow(data as Record<string, unknown> | null))
      })

    return undefined
  }, [supabase, userId])

  return state
}
