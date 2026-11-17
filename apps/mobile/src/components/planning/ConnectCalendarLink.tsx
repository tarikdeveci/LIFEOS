import { useEffect, useState } from 'react'
import { Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import { getIntegrations } from '@lifeos/shared/supabase'
import { supabase } from '@/src/lib/supabase'
import { useLang } from '@/src/contexts/LangContext'
import { useRequireAccount } from '@/src/hooks/useRequireAccount'
import { palette, fontSize, fontWeight, spacing } from '@/src/theme/tokens'

interface Props {
  userId: string
}

/**
 * Boş gün ekranında Google Takvim bağlantısı. Bağlama yalnız Ayarlar > Entegrasyonlar'daydı,
 * planlayan kullanıcı orada aramıyordu (persona turu 2026-11-17). Bağlıysa hiç görünmez.
 */
export function ConnectCalendarLink({ userId }: Props) {
  const { t } = useLang()
  const { requireAccount } = useRequireAccount()
  const [connected, setConnected] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true
    const check = async () => {
      try {
        const items = await getIntegrations(supabase, userId)
        if (alive) setConnected(items.some((i) => i.provider === 'google_calendar'))
      } catch {
        if (alive) setConnected(false)
      }
    }
    void check()
    return () => { alive = false }
  }, [userId])

  if (connected !== false) return null

  return (
    <TouchableOpacity
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onPress={() => { if (requireAccount('integration')) router.push('/(tabs)/settings/integrations' as any) }}
      accessibilityRole="link"
      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing[1], paddingHorizontal: spacing[2] }}
    >
      <Ionicons name="logo-google" size={14} color={palette.accent} />
      <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.accent }}>{t.integ_google_connect}</Text>
    </TouchableOpacity>
  )
}
