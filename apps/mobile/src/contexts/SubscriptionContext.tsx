import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/src/lib/supabase'
import { getRevenueCatUserId, isPro as storeEntitlementActive, syncRevenueCatIdentity } from '@/src/utils/purchases'
import { useAuth } from '@/src/contexts/AuthContext'

export interface SubscriptionState {
  isPro: boolean
  plan: string
  status: string
  periodEnd: string | null
  isLoading: boolean
  /** Mağaza SDK'sının kimliği bu kullanıcı olduğunda satın alma ve geri yükleme açılır */
  canPurchase: boolean
  refresh: () => Promise<void>
  /**
   * Mağaza satın alması sonrası `subscriptions` satırının yazılmasını bekler.
   *
   * isPro artık "Supabase satırı VEYA RevenueCat hakkı" olduğu için satın alan
   * kullanıcı anında Pro görünüyor — ama edge function'lar (parse-meal,
   * ai-suggest) yalnızca satıra bakıyor. Satır RevenueCat webhook'u ile
   * yazılıyor ve birkaç saniye gecikebiliyor; bu arada AI özellikleri 402
   * döner. Satır gelene kadar kısa süre bekleyip bu yarışı kapatıyoruz.
   *
   * @returns satır yetiştiyse true, süre dolduysa false (satın alma yine geçerli)
   */
  waitForBackendSync: (timeoutMs?: number) => Promise<boolean>
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
  canPurchase: false,
  refresh: async () => {},
  waitForBackendSync: async () => false,
})

/** Provider'in ic durumu — aksiyonlar haric, yalnizca veri alanlari */
type SubscriptionData = Omit<SubscriptionState, 'refresh' | 'waitForBackendSync' | 'canPurchase'>

function stateFromRow(row: Record<string, unknown> | null | undefined): SubscriptionData {
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

// Her sonuç sahibinin kimliğiyle saklanır. Kullanıcı değiştiği an, yeni kullanıcının sonucu gelmeden önce,
// eski sahibin hiçbir değeri okunmaz: A hesabının Pro görünümü B'ye bir an bile sızmaz.
interface OwnedData { uid: string; data: SubscriptionData }
interface OwnedStore { uid: string; pro: boolean; sdkUserId: string | null }

interface Props {
  children: React.ReactNode
}

export function SubscriptionProvider({ children }: Props) {
  const { userId, stage } = useAuth()
  const ready = stage === 'ready'
  const [owned, setOwned] = useState<OwnedData | null>(null)
  // Store (RevenueCat) tarafindaki hak. Supabase satiri PayTR web akisindan,
  // bu ise App Store / Play satin almasindan gelir; ikisinden biri yeterli.
  const [store, setStore] = useState<OwnedStore | null>(null)

  const ownedNow = ready && owned && owned.uid === userId ? owned.data : null
  const storeNow = ready && store && store.uid === userId ? store : null

  // Mağaza kimliğini kuyrukla eşitler, sonra hakkı yalnızca SDK kimliği bu kullanıcıysa okur.
  const syncStore = useCallback(async (target: string | null, isCurrent: () => boolean) => {
    await syncRevenueCatIdentity(target)
    if (!isCurrent() || !target) return
    const sdkUserId = await getRevenueCatUserId()
    const pro = sdkUserId === target ? await storeEntitlementActive().catch(() => false) : false
    if (isCurrent()) setStore({ uid: target, pro, sdkUserId })
  }, [])

  useEffect(() => {
    let active = true
    void syncStore(ready ? userId : null, () => active)
    return () => { active = false }
  }, [userId, ready, syncStore])

  const refresh = useCallback(async () => {
    if (!userId || !ready) return
    void syncStore(userId, () => true)

    const { data } = await supabase
      .from('subscriptions')
      .select('plan, status, current_period_end')
      .eq('user_id', userId)
      .maybeSingle()

    setOwned({ uid: userId, data: stateFromRow(data as Record<string, unknown> | null) })
  }, [userId, ready, syncStore])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!userId || !ready) return

    const applyRow = (row: unknown) => {
      setOwned({ uid: userId, data: stateFromRow(row as Record<string, unknown> | null) })
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
        () => applyRow(null),
      )

    channel.subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, ready])

  const waitForBackendSync = useCallback(async (timeoutMs = 12_000): Promise<boolean> => {
    if (!userId || !ready) return false

    const deadline = Date.now() + timeoutMs
    for (;;) {
      const { data } = await supabase
        .from('subscriptions')
        .select('plan, status, current_period_end')
        .eq('user_id', userId)
        .maybeSingle()

      const next = stateFromRow(data as Record<string, unknown> | null)
      if (next.isPro) {
        setOwned({ uid: userId, data: next })
        return true
      }
      if (Date.now() >= deadline) return false
      await new Promise((resolve) => setTimeout(resolve, 1_500))
    }
  }, [userId, ready])

  const value = useMemo<SubscriptionState>(() => {
    const db = ownedNow ?? { ...FREE_STATE, isLoading: ready }
    const canPurchase = ready && storeNow !== null && storeNow.sdkUserId === userId
    // Misafir ve onaysız aşamalarda Pro hiçbir koldan açılmaz.
    const isPro = ready && (db.isPro || (canPurchase && storeNow?.pro === true))
    return { ...db, isPro, canPurchase, refresh, waitForBackendSync }
  }, [ownedNow, storeNow, ready, userId, refresh, waitForBackendSync])

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  )
}

export function useSubscriptionStatus(): SubscriptionState {
  return useContext(SubscriptionContext)
}
