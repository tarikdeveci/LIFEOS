import { useEffect, useState } from 'react'
import { View, Text, Switch, Alert } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { supabase } from '@/src/lib/supabase'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing } from '@/src/theme/tokens'

interface Props { userId: string }

/**
 * "Gün raporu" anahtarı (notification_preferences.report_enabled, 065). Kolon yoksa
 * okuma hata verir ve anahtar hiç görünmez. Üretilmiş veritabanı tiplerinde kolon henüz
 * olmadığından satırlar gevşek tiplenir. Yazma hatasında anahtar geri alınır.
 */
export function ReportNotifToggle({ userId }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  const [enabled, setEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('notification_preferences')
          .select('report_enabled')
          .eq('user_id', userId)
          .maybeSingle()
        if (!alive || error) return
        const value = (data as { report_enabled?: unknown } | null)?.report_enabled
        setEnabled(typeof value === 'boolean' ? value : false)
      } catch {
        // Okunamadı: anahtar gösterilmez.
      }
    })()
    return () => { alive = false }
  }, [userId])

  if (enabled === null) return null

  const change = async (next: boolean) => {
    const previous = enabled
    setEnabled(next)
    const row: Record<string, unknown> = { user_id: userId, report_enabled: next }
    const { error } = await supabase
      .from('notification_preferences')
      .upsert(row as never, { onConflict: 'user_id' })
    if (error) {
      setEnabled(previous)
      Alert.alert(t.report_notif_save_failed_title, t.report_notif_save_failed)
    }
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginTop: spacing[4], paddingTop: spacing[4], borderTopWidth: 1, borderTopColor: colors.glassBorder }}>
      <Ionicons name="document-text-outline" size={18} color={palette.accent} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{t.report_notif_title}</Text>
        <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>{t.report_notif_sub}</Text>
      </View>
      <Switch
        value={enabled}
        onValueChange={(next) => void change(next)}
        trackColor={{ false: colors.glassBorder, true: `${palette.accent}80` }}
        thumbColor={enabled ? palette.accent : colors.textSubtle}
      />
    </View>
  )
}
