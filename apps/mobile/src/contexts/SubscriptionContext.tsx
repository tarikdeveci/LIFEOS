import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/src/lib/supabase'
import { isPro as storeEntitlementActive } from '@/src/utils/purchases'

export interface SubscriptionState {
  isPro: boolean
  plan: string
  status: string
  periodEnd: string | null
  isLoading: boolean
  refresh: () => Promise<void>
}

const FREE_STATE = {
  isPro: false,
  plan: 'free',
  status: 'free',
  periodEnd: null,
}

const SubscriptionContext = createContext<SubscriptionState>({
  ...FREE_STATE,
  isLoading: true,
  refresh: async () => {},
})

function stateFromRow(row: Record<string, unknown> | null | undefined): Omit<SubscriptionState, 'refresh'> {
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

interface Props {
  children: React.ReactNode
}

export function SubscriptionProvider({ children }: Props) {
  const [userId, setUserId] = useState<string | null>(null)
  const [state, setState] = useState<Omit<SubscriptionState, 'refresh'>>({
    ...FREE_STATE,
    isLoading: true,
  })
  // Store (RevenueCat) tarafindaki hak. Supabase satiri PayTR web akisindan,
  // bu ise App Store / Play satin almasindan gelir; ikisinden biri yeterli.
  // Boylece magazadan satin alan kullanici webhook'u beklemeden Pro olur.
  const [storePro, setStorePro] = useState(false)

  const refreshStore = useCallback(async () => {
    setStorePro(await storeEntitlementActive().catch(() => false))
  }, [])

  const refresh = useCallback(async () => {
    if (!userId) {
      setState({ ...FREE_STATE, isLoading: false })
      setStorePro(false)
      return
    }

    void refreshStore()

    const { data } = await supabase
      .from('subscriptions')
      .select('plan, status, current_period_end')
      .eq('user_id', userId)
      .maybeSingle()

    setState(stateFromRow(data as Record<string, unknown> | null))
  }, [userId, refreshStore])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null)
      if (!data.user) setState({ ...FREE_STATE, isLoading: false })
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null)
      if (!session?.user) setState({ ...FREE_STATE, isLoading: false })
      else setState((current) => ({ ...current, isLoading: true }))
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!userId) return

    const applyRow = (row: unknown) => {
      setState(stateFromRow(row as Record<string, unknown> | null))
    }

    const channelTopic = `subscription-global-${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const channel: RealtimeChannel = supabase
      .channel(channelTopic)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${userId}` },
        (payload) => applyRow(payload.new),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${userId}` },
        (payload) => applyRow(payload.new),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${userId}` },
        () => setState({ ...FREE_STATE, isLoading: false }),
      )

    channel.subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId])

  const value = useMemo<SubscriptionState>(
    () => ({ ...state, isPro: state.isPro || storePro, refresh }),
    [state, storePro, refresh],
  )

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  )
}

export function useSubscriptionStatus(): SubscriptionState {
  return useContext(SubscriptionContext)
}
