import { useEffect } from 'react'
import { Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Button } from '@/src/components/ui/Button'
import { useAuth } from '@/src/contexts/AuthContext'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { useGoBack } from '@/src/navigation/useGoBack'
import type { AccountReason } from '@/src/hooks/useRequireAccount'
import { palette, fontSize, fontWeight, spacing } from '@/src/theme/tokens'

/**
 * Hesap kapısı: AI, Pro ve entegrasyon hesap gerektirir. Misafire kısa bir açıklama ve iki yol sunar;
 * e-postası onay bekleyen ya da şifresi eksik kullanıcı doğrudan kendi adımına gider.
 */
export default function AccountGateScreen() {
  const { colors } = useTheme()
  const { t } = useLang()
  const goBack = useGoBack()
  const { stage } = useAuth()
  const { reason } = useLocalSearchParams<{ reason?: AccountReason }>()

  // Hesap hazırsa kapının işi biter; yarım kalan adımlar kayıt ekranının kendi aşamasına yönlenir.
  useEffect(() => {
    if (stage === 'ready') goBack()
    else if (stage === 'pending_email' || stage === 'needs_password') {
      router.replace({ pathname: '/(auth)/register', params: reason ? { reason } : {} } as never)
    }
  }, [stage, reason, goBack])

  const title = reason === 'paywall' ? t.gate_title_paywall
    : reason === 'integration' ? t.gate_title_integration
    : t.gate_title_ai

  function createAccount() {
    router.replace({ pathname: '/(auth)/register', params: reason ? { reason } : {} } as never)
  }

  return (
    <ScreenBackground>
      <View style={{ flex: 1, justifyContent: 'center', padding: spacing[5] }}>
        <GlassCard padding={spacing[6]}>
          <View style={{ alignItems: 'center', marginBottom: spacing[4] }}>
            <Ionicons name="shield-checkmark-outline" size={40} color={palette.accent} />
          </View>
          <Text accessibilityRole="header" style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.textPrimary, textAlign: 'center' }}>{title}</Text>
          <Text style={{ marginTop: spacing[2], marginBottom: spacing[5], fontSize: fontSize.base, color: colors.textMuted, textAlign: 'center' }}>{t.gate_body}</Text>
          <Button label={t.gate_create} onPress={createAccount} fullWidth />
          <View style={{ height: spacing[2] }} />
          <Button label={t.guest_have_account} onPress={() => router.replace('/(auth)/login')} variant="secondary" fullWidth />
          <View style={{ height: spacing[1] }} />
          <Button label={t.gate_not_now} onPress={goBack} variant="ghost" fullWidth />
        </GlassCard>
      </View>
    </ScreenBackground>
  )
}
