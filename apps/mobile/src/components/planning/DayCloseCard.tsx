import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { router, type Href } from 'expo-router'
import { supabase } from '@/src/lib/supabase'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing } from '@/src/theme/tokens'

interface Props {
  userId: string
  now: Date
  /** Bugünün yerel tarihi, 'YYYY-MM-DD'. */
  date: string
}

const DEFAULT_EVENING_HOUR = 18

/**
 * "Günü kapat": akşam saatinden sonra bugünün raporunu açan tek satırlık kart.
 * Akşam saati notification_preferences.evening_hour; okunamazsa 18. Saat okunana kadar
 * kart görünmez, böylece 18'de belirip 21'de kaybolan bir titreme olmaz.
 */
export function DayCloseCard({ userId, now, date }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  const [eveningHour, setEveningHour] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      let hour = DEFAULT_EVENING_HOUR
      try {
        const { data } = await supabase
          .from('notification_preferences')
          .select('evening_hour')
          .eq('user_id', userId)
          .maybeSingle()
        const value = (data as { evening_hour?: unknown } | null)?.evening_hour
        if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 23) hour = value
      } catch {
        // Okunamazsa varsayılan akşam saati.
      }
      if (alive) setEveningHour(hour)
    })()
    return () => { alive = false }
  }, [userId])

  if (eveningHour === null || now.getHours() < eveningHour) return null

  // Sayı yok: rapor halkası işleri farklı kuralla sayar (öğün, mola, manevi iş hariç), iki ayrı oran görünmesin.
  const sub = t.report_close_sub_plain

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={() => router.push(`/report?date=${date}` as Href)}
      accessibilityRole="button" accessibilityLabel={`${t.report_close_title}. ${sub}`}>
      <GlassCard padding={spacing[3]} style={{ marginBottom: spacing[4] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: `${palette.accent}18` }}>
            <Ionicons name="moon-outline" size={16} color={palette.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }} numberOfLines={1}>{t.report_close_title}</Text>
            <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 }} numberOfLines={1}>{sub}</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={colors.textSubtle} />
        </View>
      </GlassCard>
    </TouchableOpacity>
  )
}
