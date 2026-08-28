import { useRef, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { supabase } from '@/src/lib/supabase'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { markOnboardingSeen } from '@/src/onboarding/storage'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

type SlideKey = 'priority' | 'day' | 'nutrition' | 'health'

/**
 * İlk açılış turu. Her adım soyut bir çizim yerine uygulamanın kendi
 * arayüzünden bir parça gösterir, böylece tanıtım gerçekten ne göreceğini
 * anlatır.
 */
export default function OnboardingScreen() {
  const { colors } = useTheme()
  const { t } = useLang()
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const scrollRef = useRef<ScrollView>(null)
  const [index, setIndex] = useState(0)

  const slides: { key: SlideKey; title: string; body: string; preview: React.ReactNode }[] = [
    { key: 'priority',  title: t.onb_priority_title,  body: t.onb_priority_body,  preview: <PriorityPreview /> },
    { key: 'day',       title: t.onb_day_title,       body: t.onb_day_body,       preview: <DayPreview nowLabel={t.onb_now} /> },
    { key: 'nutrition', title: t.onb_nutrition_title, body: t.onb_nutrition_body, preview: <NutritionPreview /> },
    { key: 'health',    title: t.onb_health_title,    body: t.onb_health_body,    preview: <HealthPreview /> },
  ]

  const isLast = index === slides.length - 1

  async function finish() {
    const { data } = await supabase.auth.getUser()
    if (data.user) await markOnboardingSeen(data.user.id)
    router.replace('/(tabs)/today')
  }

  function goNext() {
    if (isLast) { void finish(); return }
    const next = index + 1
    scrollRef.current?.scrollTo({ x: next * width, animated: true })
    setIndex(next)
  }

  function handleScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const page = Math.round(event.nativeEvent.contentOffset.x / width)
    if (page !== index) setIndex(page)
  }

  return (
    <ScreenBackground>
      <View style={{ flex: 1, paddingTop: insets.top + spacing[2], paddingBottom: insets.bottom + spacing[5] }}>
        {/* Atla her adımda erişilebilir kalmalı */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing[5] }}>
          <TouchableOpacity
            onPress={() => void finish()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={t.onb_skip}
          >
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textMuted }}>
              {t.onb_skip}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
          style={{ flex: 1 }}
        >
          {slides.map((slide) => (
            <View key={slide.key} style={{ width, paddingHorizontal: spacing[6], justifyContent: 'center' }}>
              <View style={{ marginBottom: spacing[8] }}>{slide.preview}</View>
              <Text style={{ fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, color: colors.textPrimary, marginBottom: spacing[3] }}>
                {slide.title}
              </Text>
              <Text style={{ fontSize: fontSize.base, lineHeight: 24, color: colors.textMuted }}>
                {slide.body}
              </Text>
            </View>
          ))}
        </ScrollView>

        <View style={{ paddingHorizontal: spacing[6], gap: spacing[5] }}>
          <View style={{ flexDirection: 'row', gap: 6 }} accessibilityRole="progressbar">
            {slides.map((slide, i) => (
              <View
                key={slide.key}
                style={{ height: 3, flex: 1, borderRadius: radius.full, backgroundColor: i <= index ? palette.accent : colors.border }}
              />
            ))}
          </View>

          <TouchableOpacity
            onPress={goNext}
            accessibilityRole="button"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing[2],
              paddingVertical: 15,
              borderRadius: radius.lg,
              backgroundColor: palette.accent,
            }}
          >
            <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.bold, color: '#fff' }}>
              {isLast ? t.onb_start : t.onb_next}
            </Text>
            {!isLast && <Ionicons name="arrow-forward" size={17} color="#fff" />}
          </TouchableOpacity>
        </View>
      </View>
    </ScreenBackground>
  )
}

/** Ortak kart yüzeyi — önizlemeler uygulamanın kendi kart diliyle çizilir. */
function PreviewCard({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        padding: spacing[4],
        borderRadius: radius.lg,
        backgroundColor: colors.glassInner,
        borderWidth: 1,
        borderColor: colors.border,
        gap: spacing[3],
      }}
    >
      {children}
    </View>
  )
}

function PriorityPreview() {
  const { colors } = useTheme()
  const { t } = useLang()
  const rows = [
    { title: t.onb_task_1, score: '4.0', hot: true },
    { title: t.onb_task_2, score: '2.3', hot: false },
    { title: t.onb_task_3, score: '1.4', hot: false },
  ]
  return (
    <PreviewCard>
      {rows.map((row) => (
        <View key={row.title} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
          <View
            style={{
              minWidth: 38,
              paddingHorizontal: 7,
              paddingVertical: 3,
              borderRadius: radius.sm,
              alignItems: 'center',
              backgroundColor: row.hot ? `${palette.accent}22` : colors.glassInner,
              borderWidth: 1,
              borderColor: row.hot ? `${palette.accent}55` : colors.border,
            }}
          >
            <Text
              style={{
                fontSize: fontSize.xs,
                fontWeight: fontWeight.bold,
                color: row.hot ? palette.accent : colors.textSubtle,
                fontVariant: ['tabular-nums'],
              }}
            >
              {row.score}
            </Text>
          </View>
          <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.textSecondary }} numberOfLines={1}>
            {row.title}
          </Text>
        </View>
      ))}
    </PreviewCard>
  )
}

function DayPreview({ nowLabel }: { nowLabel: string }) {
  const { colors } = useTheme()
  const { t } = useLang()
  const blocks = [
    { time: '08:00', label: t.onb_block_focus,   tone: palette.focus,   now: true },
    { time: '12:30', label: t.onb_block_meal,    tone: palette.meal,    now: false },
    { time: '17:30', label: t.onb_block_workout, tone: palette.workout, now: false },
  ]
  return (
    <PreviewCard>
      {blocks.map((block) => (
        <View key={block.time} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
          <Text style={{ width: 40, fontSize: fontSize.xs, color: colors.textSubtle, fontVariant: ['tabular-nums'] }}>
            {block.time}
          </Text>
          <View style={{ width: 3, height: 26, borderRadius: 2, backgroundColor: block.tone }} />
          <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.textSecondary }} numberOfLines={1}>
            {block.label}
          </Text>
          {block.now && (
            <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full, backgroundColor: `${palette.accent}22` }}>
              <Text style={{ fontSize: 10, fontWeight: fontWeight.bold, color: palette.accent }}>{nowLabel}</Text>
            </View>
          )}
        </View>
      ))}
    </PreviewCard>
  )
}

function NutritionPreview() {
  const { colors } = useTheme()
  const { t } = useLang()
  const macros = [
    { label: t.onb_macro_calories, value: 1840, target: 2300, tone: palette.warning },
    { label: t.onb_macro_protein,  value: 118,  target: 150,  tone: palette.info },
    { label: t.onb_macro_carbs,    value: 190,  target: 240,  tone: palette.success },
  ]
  return (
    <PreviewCard>
      {macros.map((macro) => (
        <View key={macro.label} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{macro.label}</Text>
            <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, fontVariant: ['tabular-nums'] }}>
              {macro.value} / {macro.target}
            </Text>
          </View>
          <View style={{ height: 5, borderRadius: radius.full, backgroundColor: colors.border, overflow: 'hidden' }}>
            <View
              style={{
                width: `${Math.round((macro.value / macro.target) * 100)}%`,
                height: '100%',
                borderRadius: radius.full,
                backgroundColor: macro.tone,
              }}
            />
          </View>
        </View>
      ))}
    </PreviewCard>
  )
}

function HealthPreview() {
  const { colors } = useTheme()
  const { t } = useLang()
  const metrics = [
    { icon: 'footsteps-outline' as const, label: t.onb_health_steps, value: '8.240',    tone: palette.info },
    { icon: 'flame-outline' as const,     label: t.onb_health_active, value: '412 kcal', tone: palette.warning },
    { icon: 'moon-outline' as const,      label: t.onb_health_sleep,  value: '7s 20d',   tone: palette.deferred },
  ]
  return (
    <PreviewCard>
      {metrics.map((metric) => (
        <View key={metric.label} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
          <Ionicons name={metric.icon} size={16} color={metric.tone} />
          <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.textSecondary }}>{metric.label}</Text>
          <Text
            style={{
              fontSize: fontSize.sm,
              fontWeight: fontWeight.bold,
              color: colors.textPrimary,
              fontVariant: ['tabular-nums'],
            }}
          >
            {metric.value}
          </Text>
        </View>
      ))}
    </PreviewCard>
  )
}
