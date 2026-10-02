import type { ReactNode } from 'react'
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
  /** Kartın içine gömülen eylem (odak zamanlayıcısı). */
  children?: ReactNode
}

/**
 * Günün tek "şu an" yüzeyi: aktif blok, kalan süre, odak eylemi ve sıradaki blok.
 * Sadece bugün görüntülenirken gösterilmeli.
 */
export function NowCard({ position, blockColors, blockLabels, onJumpToNow, children }: Props) {
  const { colors } = useTheme()
  const { t, lang } = useLang()
  const { activeBlock, activeTiming, nextBlock, nextTiming, nowMinute, afterLastBlock } = position

  const accent = activeBlock ? blockColors[activeBlock.block_type] ?? palette.accent : palette.accent
  const label = (b: NonNullable<DayPosition['nextBlock']>) => b.label ?? blockLabels[b.block_type] ?? b.block_type

  return (
    <GlassCard padding={0} style={{ marginBottom: spacing[4] }}>
      <View style={{ padding: spacing[4], backgroundColor: `${accent}12` }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing[2] }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: accent }} />
          <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: accent, letterSpacing: 0.6 }}>{t.plan_now_badge}</Text>
          <Text style={{ flex: 1, fontSize: fontSize.xs, color: colors.textMuted, fontVariant: ['tabular-nums'] }}>{minutesToClock(nowMinute)}</Text>
          {onJumpToNow && (activeBlock || nextBlock) ? (
            <TouchableOpacity onPress={onJumpToNow} hitSlop={10} accessibilityLabel={t.plan_jump_to_now}>
              <Ionicons name="locate-outline" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {activeBlock && activeTiming ? (
          <>
            <Text style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.textPrimary }} numberOfLines={2}>
              {label(activeBlock)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing[1], marginBottom: spacing[3] }}>
              <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.textMuted, fontVariant: ['tabular-nums'] }}>
                {minutesToClock(activeTiming.startMinute)} - {minutesToClock(activeTiming.endMinute)}
              </Text>
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: accent }}>
                {formatDuration(activeTiming.remainingMinutes, lang)} {t.plan_remaining}
              </Text>
            </View>
            <View style={{ height: 6, borderRadius: radius.full, backgroundColor: `${accent}22`, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${Math.round(activeTiming.progress * 100)}%`, backgroundColor: accent, borderRadius: radius.full }} />
            </View>
          </>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <Ionicons name={afterLastBlock ? 'checkmark-done-outline' : 'cafe-outline'} size={20} color={colors.textMuted} />
            <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
              {afterLastBlock ? t.plan_day_over : t.plan_now_free}
            </Text>
          </View>
        )}
        {children}
      </View>

      {nextBlock && nextTiming ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[4], paddingVertical: spacing[3] }}>
          <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.textSubtle, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            {t.plan_next}
          </Text>
          <View style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: blockColors[nextBlock.block_type] ?? palette.accent }} />
          <Text style={{ flex: 1, fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textSecondary }} numberOfLines={1}>
            {label(nextBlock)}
          </Text>
          <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
            {t.plan_starts_in.replace('{d}', formatDuration(nextTiming.minutesUntilStart, lang))}
          </Text>
        </View>
      ) : null}
    </GlassCard>
  )
}
