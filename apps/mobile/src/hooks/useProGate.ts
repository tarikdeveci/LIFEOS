import { Alert } from 'react-native'
import { router } from 'expo-router'
import { useLang } from '@/src/contexts/LangContext'
import { useSubscriptionStatus } from '@/src/contexts/SubscriptionContext'

export function useProGate(_userId?: string | null) {
  const { lang } = useLang()
  const subscription = useSubscriptionStatus()

  /** @param source paywall'a hangi yoldan gelindiği (ölçüm ve paywall metni için) */
  function requirePro(source?: string): boolean {
    if (subscription.isLoading) return false
    if (subscription.isPro) return true

    Alert.alert(
      lang === 'tr' ? 'Pro gerekli' : 'Pro required',
      lang === 'tr'
        ? 'AI özellikleri yalnızca Pro üyeliklerde aktif.'
        : 'AI features are only available with a Pro membership.',
      [
        { text: lang === 'tr' ? 'Vazgeç' : 'Not now', style: 'cancel' },
        {
          text: lang === 'tr' ? "Pro'ya geç" : 'Go Pro',
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
