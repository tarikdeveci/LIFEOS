import { useCallback, useEffect } from 'react'
import { View, Text, Image, TouchableOpacity, ScrollView } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { useKeyboardScrollIntoView } from '@/src/hooks/useKeyboardScrollIntoView'
import { SetPasswordStep, UpgradeCodeStep, UpgradeDoneStep, UpgradeFormStep } from '@/src/components/account/UpgradeSteps'
import { useAuth } from '@/src/contexts/AuthContext'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { useUpgradeFlow } from '@/src/hooks/useUpgradeFlow'
import { runPostSignupAfterConfirmation } from '@/src/auth/postSignup'
import { hasSeenOnboarding } from '@/src/onboarding/storage'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

/**
 * Hesap oluşturma. Misafirde yükseltme (aynı kullanıcı, veriler yerinde), oturum yoksa önce misafir
 * oturumu açılıp aynı akış: form, e-posta kodu, şifre kendiliğinden kaydedilir, onay.
 */
export default function RegisterScreen() {
  const { colors } = useTheme()
  const { t } = useLang()
  const { reason } = useLocalSearchParams<{ reason?: string }>()
  const { userId, session } = useAuth()
  const flow = useUpgradeFlow()
  const scrollRef = useKeyboardScrollIntoView()
  const { stage, upgraded } = flow

  const leave = useCallback(async () => {
    if (reason) {
      router.back()
      return
    }
    const seen = userId ? await hasSeenOnboarding(userId) : true
    router.replace((seen ? '/(tabs)/today' : '/onboarding') as never)
  }, [reason, userId])

  // Hesap zaten hazırsa bu ekranın işi yok (örn. başka cihazda tamamlandı).
  useEffect(() => {
    if (stage === 'ready' && !upgraded) void leave()
  }, [stage, upgraded, leave])

  const onContinue = useCallback(async () => {
    if (userId) await runPostSignupAfterConfirmation(userId, reason)
    await leave()
  }, [userId, reason, leave])

  // Girişe geç: oturum varsa (misafir) uyarılı giriş ekranı, yoksa bir önceki ekran.
  const goSignIn = useCallback(() => {
    if (session) router.push('/(auth)/login' as never)
    else if (router.canGoBack()) router.back()
    else router.replace('/(auth)/login')
  }, [session])

  const showDone = upgraded && stage === 'ready'
  const showPassword = stage === 'needs_password'
  const showCode = stage === 'pending_email' && !flow.editingEmail && !!flow.pendingEmail

  const title = showDone ? t.upgrade_done_title
    : showPassword ? t.setpw_title
    : showCode ? t.upgrade_pending_title
    : t.upgrade_title
  const subtitle = showDone || showPassword || showCode ? null : t.upgrade_sub

  return (
    // KeyboardAvoidingView 'height' Android edge-to-edge altında çalışmıyor, Kodu gönder klavyenin altında kalıyordu.
    <ScreenBackground edges={['top', 'bottom']}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing[5], paddingVertical: spacing[8] }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={{ alignItems: 'center', marginBottom: spacing[8] }}>
          <View style={{ borderRadius: radius.xl, overflow: 'hidden', ...colors.shadowSoft }}>
            <Image source={require('../../assets/logo.png')} style={{ width: 80, height: 80, borderRadius: radius.xl }} />
          </View>
          <Text style={{ marginTop: spacing[4], fontSize: fontSize['3xl'], fontWeight: fontWeight.extrabold, color: colors.textPrimary }}>LifeOS</Text>
        </View>

        <GlassCard borderRadius={radius['2xl']} padding={spacing[6]}>
          <Text accessibilityRole="header" style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.textPrimary }}>{title}</Text>
          {subtitle && <Text style={{ marginTop: spacing[1], fontSize: fontSize.sm, color: colors.textMuted }}>{subtitle}</Text>}
          <View style={{ height: spacing[5] }} />

          {showDone ? (
            <UpgradeDoneStep onContinue={() => void onContinue()} />
          ) : showPassword ? (
            <SetPasswordStep busy={flow.busy} error={flow.error} onSubmit={(pw) => void flow.submitPassword(pw)} />
          ) : showCode ? (
            <UpgradeCodeStep
              busy={flow.busy} error={flow.error} info={flow.info} email={flow.pendingEmail ?? ''} cooldown={flow.cooldown}
              onSubmit={(code) => void flow.submitCode(code)} onResend={() => void flow.resend()} onChangeEmail={flow.changeEmail}
            />
          ) : (
            <UpgradeFormStep
              busy={flow.busy} error={flow.error} emailTaken={flow.emailTaken} initialEmail={flow.pendingEmail ?? undefined}
              onSubmit={(name, email, pw) => void flow.submitForm(name, email, pw)} onSignIn={goSignIn}
            />
          )}

          {!showDone && (
            <TouchableOpacity onPress={goSignIn} accessibilityRole="button" style={{ marginTop: spacing[2], minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ textAlign: 'center', fontSize: fontSize.sm, color: colors.textMuted }}>
                {t.acc_has_account}{' '}
                <Text style={{ color: palette.accent, fontWeight: fontWeight.bold }}>{t.acc_login_link}</Text>
              </Text>
            </TouchableOpacity>
          )}
        </GlassCard>
      </ScrollView>
    </ScreenBackground>
  )
}
