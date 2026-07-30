import { View, Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { formatDuration, minutesToClock, type DayPosition } from '@lifeos/shared'
import { GlassCard } from '../ui/GlassCard'
import { useTheme } from '../../contexts/ThemeContext'
import { useLang } from '../../contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '../../theme/tokens'

interface Props {
  position: DayPosition
  blockColors: Record<string, string>
  blockLabels: Record<string, string>
  /** Aktif (ya da sıradaki) bloğa kaydırma isteği */
  onJumpToNow?: () => void
}

/**
 * Planlama ekranının tepesindeki "şu an neredeyim" kartı.
 * Sadece bugün görüntülenirken gösterilmeli.
 */
export function NowCard({ position, blockColors, blockLabels, onJumpToNow }: Props) {
  const { colors } = useTheme()
  const { t, lang } = useLang()
  const { activeBlock, activeTiming, nextBlock, nextTiming, nowMinute, afterLastBlock } = position

  const clock = minutesToClock(nowMinute)
  const accent = activeBlock ? blockColors[activeBlock.block_type] ?? palette.accent : palette.accent

  return (
    <GlassCard style={{ marginBottom: spacing[4], borderColor: `${accent}55`, borderWidth: 1 }}>
      {/* Saat + ŞU AN etiketi */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing[2] }}>
          <Text style={{ fontSize: fontSize['3xl'], fontWeight: fontWeight.extrabold, color: colors.textPrimary, fontVariant: ['tabular-nums'] }}>
            {clock}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, backgroundColor: `${accent}1F` }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accent }} />
            <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: accent, letterSpacing: 0.6 }}>
              {t.plan_now_badge}
            </Text>
          </View>
        </View>
        {onJumpToNow && (activeBlock || nextBlock) ? (
          <TouchableOpacity
            onPress={onJumpToNow}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <Ionicons name="locate-outline" size={14} color={palette.accent} />
            <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: palette.accent }}>
              {t.plan_jump_to_now}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {activeBlock && activeTiming ? (
        <View style={{ gap: spacing[2] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <View style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: accent }} />
            <Text style={{ flex: 1, fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary }} numberOfLines={1}>
              {activeBlock.label ?? blockLabels[activeBlock.block_type] ?? activeBlock.block_type}
            </Text>
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: accent }}>
              {formatDuration(activeTiming.remainingMinutes, lang)} {t.plan_remaining}
            </Text>
          </View>

          {/* İlerleme çubuğu */}
          <View style={{ height: 6, borderRadius: radius.full, backgroundColor: colors.border, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${Math.round(activeTiming.progress * 100)}%`, backgroundColor: accent, borderRadius: radius.full }} />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, fontVariant: ['tabular-nums'] }}>
              {minutesToClock(activeTiming.startMinute)} – {minutesToClock(activeTiming.endMinute)}
            </Text>
            <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>
              {formatDuration(activeTiming.elapsedMinutes, lang)} {t.plan_elapsed}
            </Text>
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Ionicons
            name={afterLastBlock ? 'checkmark-done-outline' : 'cafe-outline'}
            size={18}
            color={colors.textMuted}
          />
          <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.textSecondary }}>
            {afterLastBlock ? t.plan_day_over : t.plan_now_free}
          </Text>
        </View>
      )}

      {/* Sıradaki blok */}
      {nextBlock && nextTiming ? (
        <View
          style={{
            marginTop: spacing[3],
            paddingTop: spacing[3],
            borderTopWidth: 1,
            borderTopColor: colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing[2],
          }}
        >
          <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.textSubtle, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            {t.plan_next}
          </Text>
          <View style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: blockColors[nextBlock.block_type] ?? palette.accent }} />
          <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.textSecondary }} numberOfLines={1}>
            {nextBlock.label ?? blockLabels[nextBlock.block_type] ?? nextBlock.block_type}
          </Text>
          <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textMuted }}>
            {formatDuration(nextTiming.minutesUntilStart, lang)} {t.plan_starts_in}
          </Text>
        </View>
      ) : null}
    </GlassCard>
  )
}
