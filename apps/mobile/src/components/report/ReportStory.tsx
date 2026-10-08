import { useEffect, useMemo, useRef } from 'react'
import { AccessibilityInfo, RefreshControl, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated'
import type { DailyReport } from '@lifeos/shared'
import { Button } from '@/src/components/ui/Button'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'
import { InsightCard } from './InsightCard'
import { StoryProvider, clamp01, type StoryScroll } from './motion'
import { OpenItems } from './OpenItems'
import { HabitsWeek, Programs } from './ProgressSections'
import { ReportHero } from './ReportHero'
import { formatDay, hasVitals } from '@lifeos/shared'
import { FutureSelf, Postponed, Tomorrow, WentWell } from './ReportSections'
import { BAR_HEIGHT, BackButton, EmptyDay } from './ReportStates'
import type { DayReport, DayReportView } from './useDayReport'
import { VitalsStrip } from './VitalsStrip'

interface Props {
  date: string
  report: DailyReport
  view: DayReportView
  /** Ekranın durumu ve eylemleri (useDayReport). */
  day: DayReport
  onClose: () => void
}

/** Açılış bu kadar kaydırılınca üst çubukta günün kısa özeti belirir. */
const TITLE_RANGE = [70, 120]

/**
 * Gün raporunun anlatısı: tek sütun, yukarıdan aşağı okunur. Bölümler kaydırdıkça sırayla
 * açılır (motion.tsx); üst çubuktaki ince çizgi anlatının neresinde olunduğunu gösterir.
 */
export function ReportStory({ date, report, view, day, onClose }: Props) {
  const { colors, isDark } = useTheme()
  const { lang, t } = useLang()
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  const scrollRef = useRef<Animated.ScrollView>(null)
  const scrollY = useSharedValue(0)
  const viewport = useSharedValue(0)
  const content = useSharedValue(0)
  const story = useMemo<StoryScroll>(() => ({ scrollY, viewport, content, reduced }), [scrollY, viewport, content, reduced])

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y
  })
  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, TITLE_RANGE, [0, 1], Extrapolation.CLAMP),
  }))
  const lineStyle = useAnimatedStyle(() => {
    const max = content.value - viewport.value
    return { width: `${max > 0 ? clamp01(scrollY.value / max) * 100 : 0}%` }
  })

  const narrative = report.narrative
  const isAi = narrative?.source === 'ai'
  const wasAi = useRef(isAi)
  useEffect(() => {
    // AI yorumu geldi: anlatı baştan yazıldı, okuma da baştan başlar.
    if (isAi && !wasAi.current) {
      scrollRef.current?.scrollTo({ y: 0, animated: !reduced })
      AccessibilityInfo.announceForAccessibility(t.report_ai_ready)
    }
    wasAi.current = isAi
  }, [isAi, reduced, t.report_ai_ready])

  const { summary } = view
  const empty = report.facts.items.length === 0 && view.habits.length === 0 && !hasVitals(report)
  const barTitle = summary.total > 0
    ? `${formatDay(date, lang, true)} · ${summary.done}/${summary.total}`
    : formatDay(date, lang, true)

  return (
    <StoryProvider value={story}>
      <View style={{ height: BAR_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[5] }}>
        <BackButton onPress={onClose} />
        {/* Aynı bilgi açılışta okunur; ekran okuyucu için tekrar edilmez. */}
        <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ flex: 1 }, titleStyle]}>
          <Text numberOfLines={1} style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary, fontVariant: ['tabular-nums'] }}>
            {barTitle}
          </Text>
        </Animated.View>
      </View>
      <View style={{ height: 2 }}>
        <Animated.View style={[{ height: 2, borderRadius: radius.full, backgroundColor: isDark ? palette.accent2 : palette.accent }, lineStyle]} />
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onLayout={(event) => { viewport.value = event.nativeEvent.layout.height }}
        onContentSizeChange={(_, height) => { content.value = height }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={day.refreshing} onRefresh={() => void day.refresh()} tintColor={colors.textMuted} />}
        contentContainerStyle={{ paddingHorizontal: spacing[5], paddingTop: spacing[3], paddingBottom: insets.bottom + spacing[10], gap: spacing[8] }}
      >
        <ReportHero
          dateLabel={formatDay(date, lang)}
          headline={narrative?.headline ?? null}
          isAi={isAi}
          summary={summary}
          energy={report.facts.energy}
          stale={day.stale}
        />
        {empty && <EmptyDay />}
        <WentWell lines={view.lines} />
        <OpenItems
          items={view.closure}
          saveFailed={day.saveFailed}
          onDone={day.markDone}
          onUndo={day.undoDone}
          onMark={day.mark}
          onReason={day.toggleReason}
        />
        <Postponed rows={view.postponed} />
        <VitalsStrip facts={report.facts} lang={lang} />
        <HabitsWeek habits={view.habits} />
        <Programs rows={view.programs} />
        <Tomorrow text={narrative?.suggestion ?? ''} />
        <FutureSelf text={narrative?.future_self ?? ''} />
        {!empty && (
          <InsightCard
            isAi={isAi}
            isPro={day.isPro}
            checking={day.isCheckingPro}
            loading={day.insightLoading}
            error={day.insightError}
            onAsk={() => void day.askInsight()}
          />
        )}
        <Button label={t.report_done_button} onPress={onClose} variant="secondary" fullWidth />
      </Animated.ScrollView>
    </StoryProvider>
  )
}
