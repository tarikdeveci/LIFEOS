import { Text, TouchableOpacity, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated'
import type { SkipReason } from '@lifeos/shared'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'
import { Reveal } from './motion'
import { SectionTitle } from './ReportSections'
import { fill, type ViewItem } from './reportModel'

type Mark = 'partial' | 'skipped'

interface Props {
  /** Hâlâ açık olanlar ve bu oturumda dokunulanlar. */
  items: ViewItem[]
  /** Son yazma tutmadı; ekran eski hâline döndü. */
  saveFailed: boolean
  onDone: (key: string) => void
  onUndo: (key: string) => void
  /** Seçili işarete tekrar dokunmak işareti kaldırır. */
  onMark: (key: string, outcome: Mark) => void
  /** Seçili nedene tekrar dokunmak nedeni kaldırır. */
  onReason: (key: string, reason: SkipReason) => void
}

interface CardProps extends Omit<Props, 'items' | 'saveFailed'> {
  item: ViewItem
}

const REASONS: SkipReason[] = ['energy', 'time', 'interrupted', 'not_needed', 'avoided']
/** Dokunma hedefi en az 44 pt. */
const TOUCH = 44

function ItemCard({ item, onDone, onUndo, onMark, onReason }: CardProps) {
  const { colors, isDark } = useTheme()
  const { t } = useLang()
  const accent = isDark ? palette.accent2 : palette.accent
  const marked = item.outcome === 'partial' || item.outcome === 'skipped'
  const reasonLabel: Record<SkipReason, string> = {
    energy: t.report_reason_energy,
    time: t.report_reason_time,
    interrupted: t.report_reason_interrupted,
    not_needed: t.report_reason_not_needed,
    avoided: t.report_reason_avoided,
  }
  // Manevi ve sayaçsız işte süre, sayı ve "olmadı" seçeneği yok: yalnızca sade bir onay.
  const meta = item.quiet ? '' : [item.start_time, item.minutes ? fill(t.report_minutes, { n: item.minutes }) : null].filter(Boolean).join(' · ')
  const card = { padding: spacing[4], borderRadius: radius.lg, backgroundColor: colors.glassSolid, borderWidth: 1, borderColor: colors.border, gap: spacing[3] }

  if (item.outcome === 'done') {
    return (
      <Animated.View layout={LinearTransition.duration(220)} style={[card, { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[2] }]}>
        <Ionicons name="checkmark-circle" size={22} color={palette.success} />
        <Text style={{ flex: 1, fontSize: fontSize.base, color: colors.textSecondary }} numberOfLines={2}>{item.title}</Text>
        <TouchableOpacity onPress={() => onUndo(item.key)} accessibilityRole="button" accessibilityLabel={`${item.title}: ${t.report_undo}`}
          style={{ minHeight: TOUCH, minWidth: TOUCH, alignItems: 'flex-end', justifyContent: 'center' }}>
          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: accent }}>{t.report_undo}</Text>
        </TouchableOpacity>
      </Animated.View>
    )
  }

  const choice = (label: string, active: boolean, primary: boolean, onPress: () => void) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} accessibilityRole="button" accessibilityState={{ selected: active }}
      accessibilityLabel={`${item.title}: ${label}`}
      style={{
        flex: 1, minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: spacing[1],
        borderRadius: radius.sm, borderWidth: 1,
        backgroundColor: active || primary ? `${accent}1F` : colors.glassInner,
        borderColor: active ? accent : primary ? 'transparent' : colors.border,
      }}>
      {primary && <Ionicons name="checkmark" size={16} color={accent} />}
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
        style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: active || primary ? accent : colors.textSecondary }}>
        {label}
      </Text>
    </TouchableOpacity>
  )

  return (
    <Animated.View layout={LinearTransition.duration(220)} style={card}>
      <View style={{ gap: 2 }}>
        <Text style={{ fontSize: fontSize.base, lineHeight: 21, fontWeight: fontWeight.semibold, color: colors.textPrimary }} numberOfLines={3}>{item.title}</Text>
        {meta !== '' && <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, fontVariant: ['tabular-nums'] }}>{meta}</Text>}
      </View>

      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        {choice(t.report_did, false, true, () => onDone(item.key))}
        {!item.quiet && choice(t.report_partial, item.outcome === 'partial', false, () => onMark(item.key, 'partial'))}
        {!item.quiet && choice(t.report_skipped, item.outcome === 'skipped', false, () => onMark(item.key, 'skipped'))}
      </View>

      {marked && (
        <Animated.View entering={FadeIn.duration(200)} style={{ gap: spacing[2] }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{t.report_reason_hint}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            {REASONS.map((reason) => {
              const active = item.reason === reason
              return (
                <TouchableOpacity key={reason} onPress={() => onReason(item.key, reason)} activeOpacity={0.75}
                  hitSlop={{ top: 4, bottom: 4 }} accessibilityRole="button" accessibilityState={{ selected: active }}
                  accessibilityLabel={fill(t.report_reason_a11y, { reason: reasonLabel[reason] })}
                  style={{
                    minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing[3], borderRadius: radius.full, borderWidth: 1,
                    backgroundColor: active ? `${accent}1F` : 'transparent', borderColor: active ? accent : colors.borderStrong,
                  }}>
                  <Text style={{ fontSize: fontSize.sm, fontWeight: active ? fontWeight.semibold : fontWeight.medium, color: active ? accent : colors.textSecondary }}>
                    {reasonLabel[reason]}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </Animated.View>
      )}
    </Animated.View>
  )
}

/**
 * Kapanış: raporun tek girdisi. Açık kalan her iş için tek dokunuş (yaptım, yarım, olmadı);
 * neden isteğe bağlı. Karar verilen kart yerinde kalır, böylece karar değiştirilebilir.
 */
export function OpenItems({ items, saveFailed, onDone, onUndo, onMark, onReason }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  if (items.length === 0) return null
  const allClosed = items.every((i) => i.outcome !== 'open')

  return (
    <Reveal style={{ gap: spacing[3] }}>
      <View style={{ gap: 2 }}>
        <SectionTitle label={t.report_sec_open} />
        <Text accessibilityLiveRegion="polite" style={{ fontSize: fontSize.sm, color: colors.textMuted }}>
          {allClosed ? t.report_all_closed : t.report_open_hint}
        </Text>
      </View>
      {items.map((item) => (
        <ItemCard key={item.key} item={item} onDone={onDone} onUndo={onUndo} onMark={onMark} onReason={onReason} />
      ))}
      {saveFailed && (
        <Text accessibilityLiveRegion="polite" style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>{t.report_save_error}</Text>
      )}
    </Reveal>
  )
}
