import { useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Text, View } from 'react-native'
import { router } from 'expo-router'

import { Button } from '@/src/components/ui/Button'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Input } from '@/src/components/ui/Input'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { useTheme } from '@/src/contexts/ThemeContext'
import { supabase } from '@/src/lib/supabase'
import { fontSize, fontWeight, radius, spacing } from '@/src/theme/tokens'

export default function ResetPasswordScreen() {
  const { colors } = useTheme()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)

  async function updatePassword() {
    if (password.length < 8) {
      Alert.alert('Şifre çok kısa', 'Yeni şifren en az 8 karakter olmalı.')
      return
    }
    if (password !== confirmation) {
      Alert.alert('Şifreler eşleşmiyor', 'İki alana da aynı şifreyi yaz.')
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      Alert.alert('Şifre güncellendi', 'Yeni şifrenle giriş yapabilirsin.', [
        { text: 'Girişe dön', onPress: () => router.replace('/(auth)/login') },
      ])
    } catch (error: unknown) {
      Alert.alert('Şifre güncellenemedi', error instanceof Error ? error.message : 'Lütfen bağlantıyı yeniden iste.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScreenBackground edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'center', padding: spacing[5] }}>
        <GlassCard borderRadius={radius['2xl']} padding={spacing[6]}>
          <Text style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.textPrimary }}>Yeni şifre oluştur</Text>
          <Text style={{ marginTop: spacing[2], marginBottom: spacing[5], fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20 }}>Hesabını korumak için en az 8 karakterli yeni bir şifre belirle.</Text>
          <View style={{ gap: spacing[3] }}>
            <Input label="Yeni şifre" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" placeholder="En az 8 karakter" />
            <Input label="Yeni şifre tekrar" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoComplete="new-password" placeholder="Şifreni tekrar yaz" onSubmitEditing={updatePassword} returnKeyType="done" />
            <Button label={loading ? 'Güncelleniyor...' : 'Şifreyi Güncelle'} onPress={updatePassword} loading={loading} fullWidth style={{ marginTop: spacing[2] }} />
          </View>
        </GlassCard>
      </KeyboardAvoidingView>
    </ScreenBackground>
  )
}
