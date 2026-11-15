import { Alert } from 'react-native'
import { router } from 'expo-router'
import { aiBenefitKey } from '@/src/ai/benefit'
import { useLang } from '@/src/contexts/LangContext'
import { useSubscriptionStatus } from '@/src/contexts/SubscriptionContext'
import { useRequireAccount } from '@/src/hooks/useRequireAccount'

export function useProGate(_userId?: string | null) {
  const { t } = useLang()
  const subscription = useSubscriptionStatus()
  const { requireAccount } = useRequireAccount()

  /** @param source paywall'a hangi yoldan gelindiği (ölçüm ve paywall metni için) */
  function requirePro(source?: string): boolean {
    // Misafir ve onaysız e-posta önce hesap kapısından geçer; Pro sorusu hesap hazır olunca sorulur.
    if (!requireAccount('ai')) return false
    if (subscription.isLoading) return false
    if (subscription.isPro) return true

    Alert.alert(
      t.misc_pro_required,
      t[aiBenefitKey(source)],
      [
        { text: t.misc_not_now, style: 'cancel' },
        {
          text: t.misc_go_pro,
          onPress: () => router.push({ pathname: '/paywall', params: source ? { source } : {} }),
        },
      ],
    )
    return false
  }

  return {
    isPro: subscription.isPro,
    isCheckingPro: subscription.isLoading,
    requirePro,
  }
}
