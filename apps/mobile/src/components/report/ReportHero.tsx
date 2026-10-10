import { useEffect } from 'react'
import { Text, View, useWindowDimensions } from 'react-native'
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'
import { DayRing } from './DayRing'
import { RiseText } from './motion'
import { fill, type DaySummary } from '@lifeos/shared'

interface Props {
  dateLabel: string
  /** Anlatının başlık cümlesi; anlatı yoksa tarih başlığın yerine geçer. */
  headline: string | null
  /** Anlatı AI yorumuyla yazıldı. */
  isAi: boolean
  summary: DaySummary
  /** daily_plans.energy_level (1-5) ya da null. */
  energy: number | null
  /** Önbellekteki rapor gösteriliyor, tazeleme tutmadı. */
  stale: boolean
}

type Swatch = 'done' | 'partial' | 'skipped' | 'open'

const NARROW_WIDTH = 360

/**
 * Raporun açılışı: başlık cümlesi ve günün tek bakışta özeti. Ekran açılınca halka günün
 * sırasıyla dolar, sayı yerine oturur; bu tek seferlik hareket günü bir kez "oynatır".
 */
export function ReportHero({ dateLabel, headline, isAi, summary, energy, stale }: Props) {
  const { colors, isDark } = useTheme()
  const { t } = useLang()
  const { width } = useWindowDimensions()
  const sweep = useSharedValue(0)

  useEffect(() => {
    sweep.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) })
  }, [sweep])

  const accent = isDark ? palette.accent2 : palette.accent
  const energyLabels = [t.report_energy_1, t.report_energy_2, t.report_energy_3, t.report_energy_4, t.report_energy_5]
  const energyLabel = energy !== null ? energyLabels[energy - 1] : undefined
  const stats: Array<{ id: Swatch; value: number; label: string }> = [
    { id: 'done', value: summary.done, label: t.report_stat_done },
    { id: 'partial', value: summary.partial, label: t.report_stat_partial },
    { id: 'skipped', value: summary.skipped, label: t.report_stat_skipped },
    { id: 'open', value: summary.open, label: t.report_stat_open },
  ]

  // Renk tek başına anlam taşımaz: her satırda sayı ve sözcük var, kutucuk yalnız halkayla eşleştirir.
  const swatch = (id: Swatch) => ({
    width: 10,
    height: 10,
    borderRadius: 3,
    backgroundColor: id === 'done' ? accent : id === 'partial' ? `${accent}6B` : id === 'skipped' ? colors.borderStrong : 'transparent',
    borderWidth: id === 'open' ? 1.5 : 0,
    borderColor: colors.textSubtle,
  })

  return (
    <View style={{ gap: spacing[5] }}>
      <View style={{ gap: spacing[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing[2] }}>
          <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.textSubtle, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            {t.report_kicker}
          </Text>
          {isAi && (
            <View style={{ paddingHorizontal: spacing[2], paddingVertical: 2, borderRadius: radius.full, backgroundColor: `${accent}1F` }}>
              <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: accent }}>{t.report_ai_tag}</Text>
            </View>
          )}
        </View>
        {headline !== null && (
          <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.textMuted }}>{dateLabel}</Text>
        )}
        <Text accessibilityRole="header" style={{ fontSize: fontSize['3xl'], lineHeight: 35, fontWeight: fontWeight.bold, color: colors.textPrimary, marginTop: spacing[1] }}>
          {headline ?? dateLabel}
        </Text>
        {stale && (
          <Text accessibilityLiveRegion="polite" style={{ fontSize: fontSize.sm, color: colors.textMuted }}>{t.report_stale}</Text>
        )}
      </View>

      {summary.total > 0 && (
        <GlassCard padding={spacing[4]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4] }}>
            <DayRing
              tones={summary.tones}
              size={width < NARROW_WIDTH ? 104 : 124}
              sweep={sweep}
              accessibilityLabel={fill(t.report_ring_label, { done: summary.done, total: summary.total })}
            >
              <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <RiseText
                  progress={sweep}
                  text={String(summary.done)}
                  style={{ fontSize: fontSize['4xl'], lineHeight: 40, fontWeight: fontWeight.extrabold, color: colors.textPrimary, fontVariant: ['tabular-nums'] }}
                />
                <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textMuted, fontVariant: ['tabular-nums'] }}>
                  /{summary.total}
                </Text>
              </View>
            </DayRing>

            <View style={{ flex: 1, gap: spacing[2] }}>
              {stats.filter((s) => s.value > 0).map((s) => (
                <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                  <View style={swatch(s.id)} />
                  <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.textPrimary, fontVariant: ['tabular-nums'] }}>{s.value}</Text>
                  <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.textMuted }} numberOfLines={1}>{s.label}</Text>
                </View>
              ))}
              {energyLabel && (
                <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing[1] }}>
                  {fill(t.report_energy, { label: energyLabel })}
                </Text>
              )}
            </View>
          </View>
        </GlassCard>
      )}
    </View>
  )
}
