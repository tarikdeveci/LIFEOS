import { useState } from 'react'
import { Alert, Text, View } from 'react-native'
import { router } from 'expo-router'

import { Button } from '@/src/components/ui/Button'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Input } from '@/src/components/ui/Input'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { supabase } from '@/src/lib/supabase'
import { fontSize, fontWeight, radius, spacing } from '@/src/theme/tokens'

export default function ResetPasswordScreen() {
  const { colors } = useTheme()
  const { t } = useLang()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)

  async function updatePassword() {
    if (password.length < 8) {
      Alert.alert(t.acc_password_too_short, t.acc_password_min_length)
      return
    }
    if (password !== confirmation) {
      Alert.alert(t.acc_passwords_mismatch, t.acc_passwords_match_desc)
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password, data: { password_set: true } })
      if (error) throw error
      Alert.alert(t.acc_password_updated, t.acc_password_updated_desc, [
        { text: t.acc_back_to_login, onPress: () => router.replace('/(auth)/login') },
      ])
    } catch (error: unknown) {
      Alert.alert(t.acc_password_update_failed, error instanceof Error ? error.message : t.acc_request_link_again)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScreenBackground edges={['top', 'bottom']}>
      <View style={{ flex: 1, justifyContent: 'center', padding: spacing[5] }}>
        <GlassCard borderRadius={radius['2xl']} padding={spacing[6]}>
          <Text style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.textPrimary }}>{t.acc_create_new_password}</Text>
          <Text style={{ marginTop: spacing[2], marginBottom: spacing[5], fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20 }}>{t.acc_create_new_password_desc}</Text>
          <View style={{ gap: spacing[3] }}>
            <Input label={t.acc_new_password} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" placeholder={t.acc_password_min_placeholder} />
            <Input label={t.acc_new_password_repeat} value={confirmation} onChangeText={setConfirmation} secureTextEntry autoComplete="new-password" placeholder={t.acc_repeat_password_placeholder} onSubmitEditing={updatePassword} returnKeyType="done" />
            <Button label={loading ? t.acc_updating : t.acc_update_password} onPress={updatePassword} loading={loading} fullWidth style={{ marginTop: spacing[2] }} />
          </View>
        </GlassCard>
      </View>
    </ScreenBackground>
  )
}
