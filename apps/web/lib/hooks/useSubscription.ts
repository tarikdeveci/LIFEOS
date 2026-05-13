'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export interface Subscription {
  status: 'free' | 'pro_monthly' | 'pro_annual' | 'cancelled' | 'past_due'
  plan: string
  current_period_end: string | null
  cancel_at_period_end: boolean
}

export function useSubscription() {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function fetchSubscription() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        if (mounted) setLoading(false)
        return
      }

      const { data } = await supabase
        .from('subscriptions')
        .select('status, plan, current_period_end, cancel_at_period_end')
        .eq('user_id', user.id)
        .single()

      if (mounted) {
        const sub: Subscription = data
          ? {
              status: data.status as Subscription['status'],
              plan: data.plan,
              current_period_end: data.current_period_end,
              cancel_at_period_end: data.cancel_at_period_end ?? false,
            }
          : { status: 'free', plan: 'free', current_period_end: null, cancel_at_period_end: false }
        setSubscription(sub)
        setLoading(false)
      }
    }

    void fetchSubscription()

    return () => {
      mounted = false
    }
  }, [])

  const isPro =
    (subscription?.status === 'pro_monthly' || subscription?.status === 'pro_annual') &&
    (!subscription?.current_period_end || new Date(subscription.current_period_end) > new Date())

  return { subscription, loading, isPro }
}
