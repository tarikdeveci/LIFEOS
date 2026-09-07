import { View, Text } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { streakMessage, type WorkoutStreak } from '@lifeos/shared'
import { GlassCard } from '../ui/GlassCard'
import { useTheme } from '../../contexts/ThemeContext'
import { palette, fontSize, fontWeight, spacing } from '../../theme/tokens'

/**
 * Haftalık antrenman serisi kartı.
 *
 * Seri iki haftanın altındaysa hiç çizilmiyor — `streakMessage` null dönüyor.
 * "1 haftalık seri" diye bir şey yok; her yeni kullanıcıya rozet göstermek
 * sayıyı anlamsızlaştırır ve gerçekten seri tutturana verilecek ödülü de
 * değersizleştirir.
 *
 * Seri tehlikedeyken renk uyarıya dönüyor, çünkü o an kartın işi kutlamak
 * değil harekete geçirmek.
 */
export function StreakCard({ streak }: { streak: WorkoutStreak }) {
  const { colors } = useTheme()
  const message = streakMessage(streak)
  if (!message) return null

  const tint = streak.atRisk ? palette.warning : palette.workout

  return (
    <GlassCard style={{ marginBottom: spacing[4], borderColor: `${tint}40`, borderWidth: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: `${tint}18`,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={streak.atRisk ? 'alert-circle-outline' : 'flame'} size={22} color={tint} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.textPrimary }}>
            {message.title}
          </Text>
          <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 }}>
            {message.body}
          </Text>
        </View>

        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.extrabold, color: tint, fontVariant: ['tabular-nums'] }}>
            {streak.weeks}
          </Text>
          <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>hafta</Text>
        </View>
      </View>
    </GlassCard>
  )
}
