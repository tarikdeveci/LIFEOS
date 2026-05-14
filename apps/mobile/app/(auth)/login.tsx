import { useState } from 'react'
import { View, Text, Image, TouchableOpacity, Alert, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { supabase } from '@/src/lib/supabase'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Input } from '@/src/components/ui/Input'
import { Button } from '@/src/components/ui/Button'
import { useTheme } from '@/src/contexts/ThemeContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

export default function LoginScreen() {
  const { colors } = useTheme()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!email || !password) return
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) Alert.alert('Giriş Başarısız', error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScreenBackground edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing[5], paddingVertical: spacing[8] }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
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
            Planlarını, görevlerini ve günlük ritmini tek yerde yönet.
          </Text>
        </View>

        {/* Card */}
        <GlassCard borderRadius={radius['2xl']} padding={spacing[6]}>
          <Text style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.textPrimary }}>
            Giriş Yap
          </Text>
          <Text style={{ marginTop: spacing[1], marginBottom: spacing[5], fontSize: fontSize.sm, color: colors.textMuted }}>
            Hesabınla devam et
          </Text>

          <Input
            label="E-posta"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="ornek@email.com"
            containerStyle={{ marginBottom: spacing[3] }}
          />
          <Input
            label="Şifre"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            containerStyle={{ marginBottom: spacing[5] }}
            onSubmitEditing={handleLogin}
          />

          <Button label={loading ? 'Giriş yapılıyor...' : 'Giriş Yap'} onPress={handleLogin} loading={loading} fullWidth />

          <TouchableOpacity onPress={() => router.push('/(auth)/register')} style={{ marginTop: spacing[4] }}>
            <Text style={{ textAlign: 'center', fontSize: fontSize.sm, color: colors.textMuted }}>
              Hesabın yok mu?{' '}
              <Text style={{ color: palette.accent, fontWeight: fontWeight.bold }}>Kayıt ol</Text>
            </Text>
          </TouchableOpacity>
        </GlassCard>
      </ScrollView>
    </ScreenBackground>
  )
}
