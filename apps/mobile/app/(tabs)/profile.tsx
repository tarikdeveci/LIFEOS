import { useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { supabase } from '@/src/lib/supabase'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Button } from '@/src/components/ui/Button'
import { useTheme } from '@/src/contexts/ThemeContext'
import type { ThemeMode } from '@/src/contexts/ThemeContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

export default function ProfileScreen() {
  const { colors, mode, setMode, isDark } = useTheme()
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setEmail(data.user.email ?? '')
        setDisplayName(data.user.user_metadata?.display_name ?? '')
      }
    })
  }, [])

  async function handleSignOut() {
    Alert.alert('Çıkış', 'Oturumu kapatmak istediğine emin misin?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Çıkış Yap', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ])
  }

  const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: string }[] = [
    { mode: 'light', label: 'Açık', icon: 'sunny-outline' },
    { mode: 'dark', label: 'Koyu', icon: 'moon-outline' },
    { mode: 'system', label: 'Sistem', icon: 'phone-portrait-outline' },
  ]

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{ padding: spacing[5], paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing[6] }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: spacing[4] }}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.textPrimary }}>
            Profil
          </Text>
        </View>

        {/* User info */}
        <GlassCard style={{ marginBottom: spacing[4] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4] }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: `${palette.accent}18`, borderWidth: 1, borderColor: `${palette.accent}30`, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: palette.accent }}>
                {displayName.charAt(0).toUpperCase() || '?'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{displayName || 'Kullanıcı'}</Text>
              <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 }}>{email}</Text>
            </View>
          </View>
        </GlassCard>

        {/* Theme */}
        <GlassCard style={{ marginBottom: spacing[4] }}>
          <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing[4] }}>
            Tema
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            {THEME_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.mode}
                onPress={() => setMode(opt.mode)}
                style={{
                  flex: 1, alignItems: 'center', gap: spacing[2], paddingVertical: spacing[3], borderRadius: radius.lg,
                  backgroundColor: mode === opt.mode ? `${palette.accent}18` : colors.glassInner,
                  borderWidth: 1, borderColor: mode === opt.mode ? palette.accent : colors.border,
                }}
              >
                <Ionicons name={opt.icon as never} size={20} color={mode === opt.mode ? palette.accent : colors.textMuted} />
                <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: mode === opt.mode ? palette.accent : colors.textMuted }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </GlassCard>

        {/* Sign out */}
        <Button label="Oturumu Kapat" onPress={handleSignOut} variant="danger" fullWidth />
      </ScrollView>
    </ScreenBackground>
  )
}
