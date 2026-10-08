import { Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'
import type { DayFacts } from '@lifeos/shared'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'
import { Reveal, RiseText, clamp01, type Progress } from './motion'
import { SectionTitle } from './ReportSections'
import { fill, formatNumber, type Lang } from '@lifeos/shared'

interface Props {
  facts: DayFacts
  lang: Lang
}

interface TileProps {
  progress: Progress
  /** Kutunun sıradaki yeri: sayılar soldan sağa sırayla oturur. */
  order: number
  icon: keyof typeof Ionicons.glyphMap
  label: string
  value: string
  unit: string
  sub: string | null
  /** Hedefe oran (0-1); varsa ince çubuk dolar. */
  ratio: number | null
}

/** Kutular arası gecikme (açılma oranı cinsinden). */
const STAGGER = 0.14

function Tile({ progress, order, icon, label, value, unit, sub, ratio }: TileProps) {
  const { colors, isDark } = useTheme()
  const { t } = useLang()
  const accent = isDark ? palette.accent2 : palette.accent
  const from = 0.2 + order * STAGGER
  const bar = useAnimatedStyle(() => ({
    width: `${(ratio ?? 0) * clamp01((progress.value - from) / (1 - from)) * 100}%`,
  }))

  return (
    <View
      accessible
      accessibilityLabel={[fill(t.report_vital_a11y, { label, value, unit }), sub].filter(Boolean).join('. ')}
      style={{ flexGrow: 1, flexBasis: 104, padding: spacing[3], borderRadius: radius.md, backgroundColor: colors.glassSolid, borderWidth: 1, borderColor: colors.border, gap: 2 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <Ionicons name={icon} size={14} color={colors.textMuted} />
        <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: colors.textMuted }} numberOfLines={1}>{label}</Text>
      </View>
      <RiseText
        progress={progress}
        from={from}
        text={value}
        style={{ fontSize: fontSize['2xl'], lineHeight: 30, fontWeight: fontWeight.extrabold, color: colors.textPrimary, fontVariant: ['tabular-nums'] }}
      />
      <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }} numberOfLines={1}>{unit}</Text>
      {ratio !== null && (
        <View style={{ height: 4, borderRadius: radius.full, backgroundColor: colors.border, overflow: 'hidden', marginTop: spacing[1] }}>
          <Animated.View style={[{ height: '100%', borderRadius: radius.full, backgroundColor: accent }, bar]} />
        </View>
      )}
      {sub !== null && <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, marginTop: 2 }} numberOfLines={2}>{sub}</Text>}
    </View>
  )
}

/**
 * Hareket, odak ve beslenme şeridi. Yalnızca verisi olan kutu çizilir; hiç veri yoksa bölüm
 * hiç görünmez. Kalori hedefin üstündeyse de renk değişmez: rapor uyarı vermez.
 */
export function VitalsStrip({ facts, lang }: Props) {
  const { t } = useLang()
  const { movement, focus_minutes: focus, nutrition } = facts
  const minutes = movement.exercise_minutes ?? 0
  const steps = movement.steps ?? 0
  const tiles: Array<Omit<TileProps, 'progress' | 'order'>> = []

  if (minutes > 0 || steps > 0 || movement.workout_done) {
    const stepsSub = minutes > 0 && steps > 0 ? fill(t.report_steps_sub, { n: formatNumber(steps, lang) }) : null
    const sub = [stepsSub, movement.workout_done ? t.report_workout_done : null].filter(Boolean).join(', ')
    tiles.push({
      icon: 'walk-outline',
      label: t.report_move_label,
      value: formatNumber(minutes > 0 ? minutes : steps, lang),
      unit: minutes > 0 ? t.report_move_unit : t.report_steps_unit,
      sub: sub === '' ? null : sub,
      ratio: null,
    })
  }
  if (focus > 0) {
    tiles.push({ icon: 'timer-outline', label: t.report_focus_label, value: formatNumber(focus, lang), unit: t.report_focus_unit, sub: null, ratio: null })
  }
  if (nutrition) {
    const target = nutrition.calorie_target
    tiles.push({
      icon: 'restaurant-outline',
      label: t.report_food_label,
      value: formatNumber(nutrition.calories, lang),
      unit: target ? `${t.report_kcal_unit}, ${fill(t.report_kcal_target, { n: formatNumber(target, lang) })}` : t.report_kcal_unit,
      sub: fill(t.report_protein_meals, { g: formatNumber(nutrition.protein_g, lang), n: nutrition.meals }),
      ratio: target ? Math.min(nutrition.calories / target, 1) : null,
    })
  }
  if (tiles.length === 0) return null

  return (
    <Reveal style={{ gap: spacing[3] }}>
      {(progress) => (
        <>
          <SectionTitle label={t.report_sec_vitals} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            {tiles.map((tile, order) => <Tile key={tile.label} progress={progress} order={order} {...tile} />)}
          </View>
        </>
      )}
    </Reveal>
  )
}
