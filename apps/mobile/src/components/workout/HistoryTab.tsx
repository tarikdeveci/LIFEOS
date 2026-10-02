import { View, Text } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { fromDateString } from '@lifeos/shared'
import type { Workout } from '@lifeos/shared'
import { GlassCard } from '../ui/GlassCard'
import { useTheme } from '../../contexts/ThemeContext'
import { useLang } from '../../contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '../../theme/tokens'

interface Props {
  history: Workout[]
}

const HISTORY_COLOR: Record<string, string> = {
  completed: palette.success,
  in_progress: palette.workout,
  planned: palette.accent,
  skipped: palette.warning,
}

/** Antrenman ekranının Geçmiş sekmesi: geçmiş antrenmanlar, tarih, süre ve durum rozetiyle. */
export function HistoryTab({ history }: Props) {
  const { colors } = useTheme()
  const { t, lang } = useLang()
  const historyLabel = (s: string) => ({
    completed: t.wk_hist_completed, in_progress: t.wk_hist_in_progress, planned: t.wk_hist_planned, skipped: t.wk_hist_skipped,
  } as Record<string, string>)[s] ?? s

  if (history.length === 0) {
    return (
      <View style={{ paddingTop: spacing[8], alignItems: 'center', gap: spacing[3] }}>
        <Ionicons name="time-outline" size={48} color={colors.textSubtle} />
        <Text style={{ fontSize: fontSize.base, color: colors.textSubtle }}>{t.wk_no_history}</Text>
      </View>
    )
  }

  return (
    <View style={{ gap: spacing[3] }}>
      {history.map((w) => (
        <GlassCard key={w.id} padding={spacing[4]} noShadow>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{w.name?.trim() || t.wk_workout}</Text>
              <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 }}>
                {fromDateString(w.date).toLocaleDateString(lang === 'en' ? 'en-US' : 'tr-TR', { day: 'numeric', month: 'short', weekday: 'short' })}
                {w.duration_minutes ? ` · ${t.wk_min_n.replace('{n}', String(w.duration_minutes))}` : ''}
              </Text>
            </View>
            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.md, backgroundColor: `${HISTORY_COLOR[w.status] ?? palette.warning}18` }}>
              <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: HISTORY_COLOR[w.status] ?? palette.warning }}>
                {historyLabel(w.status)}
              </Text>
            </View>
          </View>
        </GlassCard>
      ))}
    </View>
  )
}
