// Raporun yazı bölümleri: iyi gidenler, ertelenenler, yarın için öneri, gelecekteki kendin.
import { Text, View, useWindowDimensions } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import Svg, { Path } from 'react-native-svg'
import Animated, { useAnimatedProps } from 'react-native-reanimated'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing } from '@/src/theme/tokens'
import { Reveal, clamp01, type Progress } from './motion'
import type { PostponedRow } from '@lifeos/shared'

interface SectionTitleProps { label: string }
interface WentWellProps { lines: string[] }
interface CheckLineProps { progress: Progress; text: string }
interface PostponedProps { rows: PostponedRow[] }
interface SentenceProps { text: string }

const AnimatedPath = Animated.createAnimatedComponent(Path)
/** Onay işaretinin yol uzunluğu (14x14 kutuda). */
const CHECK_LENGTH = 13.2
const NARROW_WIDTH = 360

export function SectionTitle({ label }: SectionTitleProps) {
  const { colors } = useTheme()
  const { lang } = useLang()
  // textTransform cihaz diline bakar: İngilizce telefonda "İyi" "İYI" olur. Uygulama diliyle büyüt.
  return (
    <Text accessibilityRole="header" style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.textSubtle, letterSpacing: 0.6 }}>
      {label.toLocaleUpperCase(lang)}
    </Text>
  )
}

/** Satır ekrana girerken onay işareti çizilir: "bu oldu" işareti satırla birlikte konur. */
function CheckLine({ progress, text }: CheckLineProps) {
  const { colors } = useTheme()
  const animatedProps = useAnimatedProps(() => {
    const drawn = clamp01((progress.value - 0.35) / 0.65)
    return { strokeDashoffset: CHECK_LENGTH * (1 - drawn), strokeOpacity: drawn > 0 ? 1 : 0 }
  })

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: `${palette.success}1F` }}>
        <Svg width={14} height={14} viewBox="0 0 14 14">
          <AnimatedPath
            d="M2.5 7.4 L5.6 10.4 L11.5 3.9"
            fill="none"
            stroke={palette.success}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={[CHECK_LENGTH, CHECK_LENGTH]}
            animatedProps={animatedProps}
          />
        </Svg>
      </View>
      <Text style={{ flex: 1, fontSize: fontSize.base, lineHeight: 23, color: colors.textPrimary }}>{text}</Text>
    </View>
  )
}

export function WentWell({ lines }: WentWellProps) {
  const { t } = useLang()
  if (lines.length === 0) return null

  return (
    <Reveal style={{ gap: spacing[3] }}>
      <SectionTitle label={t.report_sec_well} />
      {lines.map((line, index) => (
        <Reveal key={`${index}-${line}`}>
          {(progress) => <CheckLine progress={progress} text={line} />}
        </Reveal>
      ))}
    </Reveal>
  )
}

/** Ertelenenler: sade liste. Renk ve dil nötr; neden varsa cümlesiyle birlikte. */
export function Postponed({ rows }: PostponedProps) {
  const { colors } = useTheme()
  const { t } = useLang()
  if (rows.length === 0) return null

  const reasonNote = {
    energy: t.report_note_energy,
    time: t.report_note_time,
    interrupted: t.report_note_interrupted,
    not_needed: t.report_note_not_needed,
    avoided: t.report_note_avoided,
  }

  return (
    <Reveal style={{ gap: spacing[3] }}>
      <SectionTitle label={t.report_sec_postponed} />
      {rows.map((row) => {
        const outcome = row.outcome === 'partial' ? t.report_outcome_partial : t.report_outcome_skipped
        const detail = row.note ?? (row.reason ? `${outcome}. ${reasonNote[row.reason]}` : `${outcome}.`)
        return (
          <Reveal key={row.key}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] }}>
              <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={row.outcome === 'partial' ? 'contrast-outline' : 'ellipse-outline'} size={18} color={colors.textSubtle} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: fontSize.base, lineHeight: 22, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{row.title}</Text>
                <Text style={{ fontSize: fontSize.sm, lineHeight: 19, color: colors.textMuted }}>{detail}</Text>
              </View>
            </View>
          </Reveal>
        )
      })}
    </Reveal>
  )
}

/** Yarın için tek öneri: raporun eyleme dönen tek cümlesi, bu yüzden kendi kartında. */
export function Tomorrow({ text }: SentenceProps) {
  const { colors, isDark } = useTheme()
  const { t } = useLang()
  if (text.trim() === '') return null

  return (
    <Reveal>
      <GlassCard padding={0}>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ width: 4, backgroundColor: isDark ? palette.accent2 : palette.accent }} />
          <View style={{ flex: 1, padding: spacing[4], gap: spacing[2] }}>
            <SectionTitle label={t.report_sec_tomorrow} />
            <Text style={{ fontSize: fontSize.lg, lineHeight: 25, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{text}</Text>
          </View>
        </View>
      </GlassCard>
    </Reveal>
  )
}

/** Kapanış cümlesi: kartsız, büyük yazı. Raporun son sözü. */
export function FutureSelf({ text }: SentenceProps) {
  const { colors } = useTheme()
  const { t } = useLang()
  const { width } = useWindowDimensions()
  if (text.trim() === '') return null
  const narrow = width < NARROW_WIDTH

  return (
    <Reveal style={{ gap: spacing[3] }}>
      <SectionTitle label={t.report_sec_future} />
      <Text style={{ fontSize: narrow ? fontSize.xl : fontSize['2xl'], lineHeight: narrow ? 28 : 32, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
        {text}
      </Text>
    </Reveal>
  )
}
