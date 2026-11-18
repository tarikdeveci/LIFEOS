import { useEffect, useState } from 'react'
import { View, Text, Image, TouchableOpacity, Alert, ScrollView } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '@/src/lib/supabase'
import { registerForPushNotificationsAsync, unregisterPushTokenAsync } from '@/src/notifications/setup'
import { bootstrapGuest } from '@/src/auth/bootstrap'
import { loadGuestSwitchWarning } from '@/src/auth/guestData'
import { joinCountedParts } from '@/src/auth/switchWarning'
import { loginErrorKey } from '@/src/auth/loginError'
import { useAuth } from '@/src/contexts/AuthContext'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { useKeyboardScrollIntoView } from '@/src/hooks/useKeyboardScrollIntoView'
import { Input } from '@/src/components/ui/Input'
import { Button } from '@/src/components/ui/Button'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

// Supabase'in SMTP "minimum interval per user" ayarıyla aynı: daha erken
// denemede sunucu zaten hata döner, bounce'ı tetiklemeden burada durduruyoruz.
const RESET_COOLDOWN_SECONDS = 60

export default function LoginScreen() {
  const { colors } = useTheme()
  const { t } = useLang()
  const { session, userId, isAnonymous } = useAuth()
  const [guestLoading, setGuestLoading] = useState(false)
  const [guestError, setGuestError] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [resetCooldown, setResetCooldown] = useState(0)
  const scrollRef = useKeyboardScrollIntoView({ revealFormEnd: true })

  useEffect(() => {
    if (resetCooldown <= 0) return
    const timer = setTimeout(() => setResetCooldown(resetCooldown - 1), 1000)
    return () => clearTimeout(timer)
  }, [resetCooldown])

  async function signIn() {
    setLoading(true)
    setLoginError(null)
    try {
      // Misafir oturumun push token'ı oturum değişmeden silinir (silme RLS altında çalışır).
      if (isAnonymous) await unregisterPushTokenAsync()
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) {
        setLoginError(t[loginErrorKey(error)])
        if (isAnonymous) void registerForPushNotificationsAsync({ prompt: false })
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin() {
    if (!email.trim() || !password) {
      setLoginError(t.acc_login_err_empty)
      return
    }

    // Misafirken mevcut hesaba girmek misafir verisini geride bırakır: önce neyin kaybolacağı söylenir.
    if (isAnonymous && userId) {
      setLoading(true)
      const warning = await loadGuestSwitchWarning(userId)
      setLoading(false)
      if (warning.kind !== 'none') {
        const partLabels = { tasks: t.switch_warn_tasks, meals: t.switch_warn_meals, blocks: t.switch_warn_blocks, workouts: t.switch_warn_workouts }
        const body = warning.kind === 'counted'
          ? t.switch_warn_counted.replace('{items}', joinCountedParts(warning, (key, n) => partLabels[key].replace('{n}', String(n)), t.switch_warn_and))
          : t.switch_warn_body
        Alert.alert(t.switch_warn_title, body, [
          { text: t.switch_warn_cancel, style: 'cancel' },
          { text: t.switch_warn_confirm, style: 'destructive', onPress: () => void signIn() },
        ])
        return
      }
    }
    await signIn()
  }

  async function handleGuest() {
    setGuestLoading(true)
    setGuestError(false)
    try {
      // Oturum açılınca kök yönlendirme kullanıcıyı içeri alır.
      if (!(await bootstrapGuest())) setGuestError(true)
    } finally {
      setGuestLoading(false)
    }
  }

  async function handlePasswordReset() {
    const normalizedEmail = email.trim()
    if (!normalizedEmail) {
      Alert.alert(t.acc_email_required, t.acc_reset_link_email_desc)
      return
    }
    if (resetCooldown > 0) return
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: 'lifeos://reset-password',
      })
      if (error) throw error
      setResetCooldown(RESET_COOLDOWN_SECONDS)
      Alert.alert(t.acc_link_sent, t.acc_link_sent_desc)
    } catch (error: unknown) {
      const key = loginErrorKey(error)
      const reason = key === 'acc_login_err_rate_limit' || key === 'acc_login_err_network' ? t[key] : t.acc_try_again_later
      Alert.alert(t.acc_send_failed, reason)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScreenBackground edges={['top', 'bottom']}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing[5], paddingVertical: spacing[8] }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Logo */}
        <View style={{ alignItems: 'center', marginBottom: spacing[8] }}>
          <View style={{ borderRadius: radius.xl, overflow: 'hidden', ...colors.shadowSoft }}>
            <Image source={require('../../assets/logo.png')} style={{ width: 80, height: 80, borderRadius: radius.xl }} />
          </View>
          <Text style={{ marginTop: spacing[4], fontSize: fontSize['3xl'], fontWeight: fontWeight.extrabold, color: colors.textPrimary }}>
            LifeOS
          </Text>
          <Text style={{ marginTop: spacing[2], fontSize: fontSize.base, color: colors.textMuted, textAlign: 'center', maxWidth: 260 }}>
            {t.acc_login_subtitle}
          </Text>
        </View>

        {/* Card */}
        <GlassCard borderRadius={radius['2xl']} padding={spacing[6]}>
          <Text style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.textPrimary }}>
            {t.acc_login}
          </Text>
          <Text style={{ marginTop: spacing[1], marginBottom: spacing[5], fontSize: fontSize.sm, color: colors.textMuted }}>
            {t.acc_login_continue}
          </Text>

          <Input
            label={t.acc_email}
            value={email}
            onChangeText={(value) => { setEmail(value); setLoginError(null) }}

            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholder={t.acc_email_placeholder}
            containerStyle={{ marginBottom: spacing[3] }}
            returnKeyType="next"
          />
          <Input
            label={t.acc_password}
            value={password}
            onChangeText={(value) => { setPassword(value); setLoginError(null) }}
            secureTextEntry
            placeholder={t.acc_password_placeholder}
            containerStyle={{ marginBottom: spacing[5] }}
            onSubmitEditing={handleLogin}
            returnKeyType="done"
          />

          {loginError && (
            <Text accessibilityRole="alert" style={{ marginBottom: spacing[3], fontSize: fontSize.sm, color: palette.danger }}>
              {loginError}
            </Text>
          )}
          <Button label={loading ? t.acc_logging_in : t.acc_login} onPress={handleLogin} loading={loading} fullWidth />

          <TouchableOpacity onPress={handlePasswordReset} disabled={loading || resetCooldown > 0} style={{ marginTop: spacing[4] }}>
            <Text style={{ textAlign: 'center', fontSize: fontSize.sm, color: resetCooldown > 0 ? colors.textMuted : palette.accent, fontWeight: fontWeight.semibold }}>
              {resetCooldown > 0 ? t.acc_resend_seconds.replace('{n}', String(resetCooldown)) : t.acc_forgot_password}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/(auth)/register')} style={{ marginTop: spacing[4] }}>
            <Text style={{ textAlign: 'center', fontSize: fontSize.sm, color: colors.textMuted }}>
              {t.acc_no_account}{' '}
              <Text style={{ color: palette.accent, fontWeight: fontWeight.bold }}>{t.acc_register_link}</Text>
            </Text>
          </TouchableOpacity>
        </GlassCard>

        {/* Oturum yoksa (çıkış yapmış ya da ilk açılış başarısız) misafir olarak da başlanabilir. */}
        {!session && (
          <View style={{ marginTop: spacing[4] }}>
            <Button label={t.guest_continue} onPress={handleGuest} loading={guestLoading} variant="secondary" fullWidth />
            {guestError && (
              <Text accessibilityRole="alert" style={{ marginTop: spacing[2], textAlign: 'center', fontSize: fontSize.sm, color: palette.danger }}>
                {t.guest_start_failed}
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </ScreenBackground>
  )
}
