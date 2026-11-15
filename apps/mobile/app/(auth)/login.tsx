import { useEffect, useState } from 'react'
import { View, Text, Image, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { router } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '@/src/lib/supabase'
import { GlassCard } from '@/src/components/ui/GlassCard'
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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetCooldown, setResetCooldown] = useState(0)

  useEffect(() => {
    if (resetCooldown <= 0) return
    const timer = setTimeout(() => setResetCooldown(resetCooldown - 1), 1000)
    return () => clearTimeout(timer)
  }, [resetCooldown])

  async function handleLogin() {
    if (!email || !password) return
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) Alert.alert(t.acc_login_failed, error.message)
    } finally {
      setLoading(false)
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
      Alert.alert(t.acc_send_failed, error instanceof Error ? error.message : t.acc_try_again_later)
    } finally {
      setLoading(false)
    }
  }

  return (
    <LinearGradient colors={colors.gradientColors as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
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
              onChangeText={setEmail}
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
              onChangeText={setPassword}
              secureTextEntry
              placeholder={t.acc_password_placeholder}
              containerStyle={{ marginBottom: spacing[5] }}
              onSubmitEditing={handleLogin}
              returnKeyType="done"
            />

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
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  )
}
