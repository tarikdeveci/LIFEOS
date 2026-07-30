import { useState } from 'react'
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

export default function RegisterScreen() {
  const { colors } = useTheme()
  const { t } = useLang()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRegister() {
    if (!displayName || !email || !password) return
    setLoading(true)
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { data: { display_name: displayName.trim(), timezone } },
      })
      if (error) Alert.alert('Kayıt Başarısız', error.message)
      else if (!data.user) Alert.alert('Bilgi', 'E-postanı doğrula ve giriş yap.')
    } finally { setLoading(false) }
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
          <View style={{ alignItems: 'center', marginBottom: spacing[8] }}>
            <View style={{ borderRadius: radius.xl, overflow: 'hidden', ...colors.shadowSoft }}>
              <Image source={require('../../assets/logo.png')} style={{ width: 80, height: 80, borderRadius: radius.xl }} />
            </View>
            <Text style={{ marginTop: spacing[4], fontSize: fontSize['3xl'], fontWeight: fontWeight.extrabold, color: colors.textPrimary }}>LifeOS</Text>
            <Text style={{ marginTop: spacing[2], fontSize: fontSize.base, color: colors.textMuted, textAlign: 'center', maxWidth: 260 }}>
              Hesabını oluştur ve günlük sistemini kur.
            </Text>
          </View>

          <GlassCard borderRadius={radius['2xl']} padding={spacing[6]}>
            <Text style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.textPrimary }}>Kayıt Ol</Text>
            <Text style={{ marginTop: spacing[1], marginBottom: spacing[5], fontSize: fontSize.sm, color: colors.textMuted }}>Temel bilgilerini gir</Text>

            <Input label={t.auth_full_name} value={displayName} onChangeText={setDisplayName} autoCapitalize="words" placeholder={t.auth_full_name_ph} containerStyle={{ marginBottom: spacing[3] }} returnKeyType="next" />
            <Input label="E-posta" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="ornek@email.com" containerStyle={{ marginBottom: spacing[3] }} returnKeyType="next" />
            <Input label="Şifre" value={password} onChangeText={setPassword} secureTextEntry placeholder="En az 8 karakter" containerStyle={{ marginBottom: spacing[5] }} onSubmitEditing={handleRegister} returnKeyType="done" />

            <Button label={loading ? 'Hesap oluşturuluyor...' : 'Kayıt Ol'} onPress={handleRegister} loading={loading} fullWidth />

            <TouchableOpacity onPress={() => router.back()} style={{ marginTop: spacing[4] }}>
              <Text style={{ textAlign: 'center', fontSize: fontSize.sm, color: colors.textMuted }}>
                Hesabın var mı?{' '}
                <Text style={{ color: palette.accent, fontWeight: fontWeight.bold }}>Giriş yap</Text>
              </Text>
            </TouchableOpacity>
          </GlassCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  )
}
