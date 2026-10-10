// Raporun ilerleme bölümleri: haftalık alışkanlık sayımı ve program adımı (örnek: 7/42).
import { Text, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'
import type { HabitWeek } from '@lifeos/shared'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'
import { Reveal, clamp01, type Progress } from './motion'
import { SectionTitle } from './ReportSections'
import { fill, type ProgramRow } from '@lifeos/shared'

interface HabitsWeekProps { habits: HabitWeek[] }
interface HabitRowProps { habit: HabitWeek; progress: Progress }
interface PipProps { index: number; filled: number; progress: Progress; color: string }
interface ProgramsProps { rows: ProgramRow[] }
interface ProgramCardProps { row: ProgramRow; progress: Progress }

/** Dolum, satır açılmaya başladıktan biraz sonra başlar: önce satır okunur, sonra sayı dolar. */
const FILL_FROM = 0.25
const BAR_HEIGHT = 6

/** Haftanın bir günü. Dolu olanlar soldan sağa sırayla dolar. */
function Pip({ index, filled, progress, color }: PipProps) {
  const { colors } = useTheme()
  const animated = useAnimatedStyle(() => {
    const p = clamp01((progress.value - FILL_FROM) / (1 - FILL_FROM))
    return { width: `${clamp01(p * filled - index) * 100}%` }
  })

  return (
    <View style={{ flex: 1, height: BAR_HEIGHT, borderRadius: radius.full, backgroundColor: colors.border, overflow: 'hidden' }}>
      {index < filled && <Animated.View style={[{ height: '100%', borderRadius: radius.full, backgroundColor: color }, animated]} />}
    </View>
  )
}

function HabitRow({ habit, progress }: HabitRowProps) {
  const { colors, isDark } = useTheme()
  const { t } = useLang()
  const filled = Math.min(habit.done, habit.target)
  const met = habit.done >= habit.target
  // Hedefe ulaşan satır yalnız renkle ayrılmaz: sayının yanında onay işareti de var.
  const color = met ? palette.success : isDark ? palette.accent2 : palette.accent

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={fill(t.report_habit_a11y, { title: habit.title, done: habit.done, target: habit.target })}
      accessibilityValue={{ min: 0, max: habit.target, now: filled }}
      style={{ gap: spacing[2] }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] }}>
        <Text style={{ flex: 1, fontSize: fontSize.base, lineHeight: 21, color: colors.textPrimary }} numberOfLines={2}>{habit.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {met && <Ionicons name="checkmark-circle" size={16} color={palette.success} />}
          <Text style={{ fontSize: fontSize.base, lineHeight: 21, fontWeight: fontWeight.semibold, color: colors.textSecondary, fontVariant: ['tabular-nums'] }}>
            {habit.done}/{habit.target}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {Array.from({ length: habit.target }, (_, index) => (
          <Pip key={index} index={index} filled={filled} progress={progress} color={color} />
        ))}
      </View>
    </View>
  )
}

/** Haftalık alışkanlıklar: her satır ekrana girerken haftanın dolan günleri sırayla dolar. */
export function HabitsWeek({ habits }: HabitsWeekProps) {
  const { t } = useLang()
  if (habits.length === 0) return null

  return (
    <Reveal style={{ gap: spacing[4] }}>
      <SectionTitle label={t.report_sec_habits} />
      {habits.map((habit) => (
        <Reveal key={habit.routine_id}>
          {(progress) => <HabitRow habit={habit} progress={progress} />}
        </Reveal>
      ))}
    </Reveal>
  )
}

function ProgramCard({ row, progress }: ProgramCardProps) {
  const { colors, isDark } = useTheme()
  const { t } = useLang()
  const done = Math.min(row.done, row.target)
  const to = row.target > 0 ? done / row.target : 0
  // Bugün adım atıldıysa çubuk dünkü yerinden bugünküne yürür; atılmadıysa yerinde durur.
  const from = row.advanced && row.target > 0 ? Math.max(done - 1, 0) / row.target : to
  const animated = useAnimatedStyle(() => {
    const p = clamp01((progress.value - FILL_FROM) / (1 - FILL_FROM))
    return { width: `${(from + (to - from) * p) * 100}%` }
  })
  const caption = row.advanced ? t.report_program_today : done < row.target ? t.report_program_resume : null

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={[fill(t.report_program_a11y, { title: row.title, done, target: row.target }), caption].filter(Boolean).join('. ')}
      accessibilityValue={{ min: 0, max: row.target, now: done }}
      style={{ padding: spacing[4], borderRadius: radius.lg, backgroundColor: colors.glassSolid, borderWidth: 1, borderColor: colors.border, gap: spacing[3] }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing[3] }}>
        <Text style={{ flex: 1, fontSize: fontSize.base, lineHeight: 21, fontWeight: fontWeight.semibold, color: colors.textPrimary }} numberOfLines={2}>{row.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={{ fontSize: fontSize['2xl'], lineHeight: 28, fontWeight: fontWeight.extrabold, color: colors.textPrimary, fontVariant: ['tabular-nums'] }}>{done}</Text>
          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textMuted, fontVariant: ['tabular-nums'] }}>/{row.target}</Text>
        </View>
      </View>
      <View style={{ height: BAR_HEIGHT, borderRadius: radius.full, backgroundColor: colors.border, overflow: 'hidden' }}>
        <Animated.View style={[{ height: '100%', borderRadius: radius.full, backgroundColor: isDark ? palette.accent2 : palette.accent }, animated]} />
      </View>
      {caption !== null && <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>{caption}</Text>}
    </View>
  )
}

/** Program ilerlemesi: toplam yolun neresinde olunduğu. Yüzde yok, adım sayısı var. */
export function Programs({ rows }: ProgramsProps) {
  const { t } = useLang()
  if (rows.length === 0) return null

  return (
    <Reveal style={{ gap: spacing[3] }}>
      <SectionTitle label={t.report_sec_program} />
      {rows.map((row) => (
        <Reveal key={`${row.title}|${row.target}`}>
          {(progress) => <ProgramCard row={row} progress={progress} />}
        </Reveal>
      ))}
    </Reveal>
  )
}
