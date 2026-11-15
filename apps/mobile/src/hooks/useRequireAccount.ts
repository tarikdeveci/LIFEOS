import { useCallback } from 'react'
import { router } from 'expo-router'
import { track } from '@lifeos/shared/supabase'
import { supabase } from '@/src/lib/supabase'
import { useAuth } from '@/src/contexts/AuthContext'

/** Hesap gerektiren eylemin sebebi: kapı metni ve ölçüm için. */
export type AccountReason = 'paywall' | 'ai' | 'integration' | 'backup' | 'login_switch'

/**
 * Hesap gerektiren eylemden önce çağrılır. Hesap hazırsa true; değilse kapıyı açar ve false döner
 * (çağıran eylemi yapmaz). Kapı aşamaya göre kendi adımını gösterir: misafir için tanıtım,
 * onay bekleyen için kod, şifresiz için şifre.
 */
export function useRequireAccount() {
  const { stage, userId } = useAuth()

  const requireAccount = useCallback((reason: AccountReason, options: { replace?: boolean } = {}): boolean => {
    if (stage === 'ready') return true
    if (!stage || !userId) return false
    void track(supabase, userId, 'account_gate_shown', { reason, stage })
    const target = { pathname: '/account-gate', params: { reason } } as const
    if (options.replace) router.replace(target)
    else router.push(target)
    return false
  }, [stage, userId])

  return { requireAccount, accountReady: stage === 'ready', stage }
}
