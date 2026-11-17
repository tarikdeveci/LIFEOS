import { useEffect, useMemo, useState } from 'react'
import { View, TouchableOpacity, Platform, type LayoutChangeEvent } from 'react-native'
import { useRouter, usePathname, type Href } from 'expo-router'
import { BlurView } from 'expo-blur'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, radius } from '@/src/theme/tokens'
import { coachRef } from '@/src/onboarding/coach'

export const TABS = [
  { segment: 'today',     label: 'tab_today',     icon: 'home-outline',             iconActive: 'home'             },
  { segment: 'planning',  label: 'tab_planning',  icon: 'calendar-outline',         iconActive: 'calendar'         },
  { segment: 'tasks',     label: 'tab_tasks',     icon: 'checkmark-circle-outline', iconActive: 'checkmark-circle' },
  { segment: 'nutrition', label: 'tab_nutrition', icon: 'restaurant-outline',       iconActive: 'restaurant'       },
  { segment: 'workout',   label: 'tab_workout',   icon: 'barbell-outline',          iconActive: 'barbell'          },
] as const

const BAR_HEIGHT = 64
const ROW_PADDING = 6
const PILL_INSET = 4
const PILL_HEIGHT = 52
const DRAG_START = 8
/** Gösterge hızla kayarken yatayda uzar, dikeyde incelir: sıvı damla hissi. */
const MAX_STRETCH = 0.35
const STRETCH_VELOCITY = 4000
const PILL_SPRING = { damping: 18, stiffness: 220, mass: 0.8 }

function clampIndex(x: number, itemWidth: number): number {
  'worklet'
  const raw = Math.floor((x - ROW_PADDING) / itemWidth)
  return Math.min(TABS.length - 1, Math.max(0, raw))
}

/**
 * Yüzen sekme çubuğu. Dokunarak ya da parmağı çubuk üzerinde kaydırarak sekme değişir;
 * cam gösterge parmağı izler, bırakınca altındaki sekmeye yaylanarak oturur.
 */
export function FloatingTabBar() {
  const router = useRouter()
  const pathname = usePathname()
  const { colors, isDark } = useTheme()
  const { t } = useLang()
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()
  const bottomOffset = Math.max(insets.bottom + 8, Platform.OS === 'ios' ? 28 : 16)
  const activeColor = isDark ? palette.accent2 : palette.accent

  const focusedIndex = TABS.findIndex((tab) => pathname === `/${tab.segment}` || pathname.startsWith(`/${tab.segment}/`))
  const [itemWidth, setItemWidth] = useState(0)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const pillX = useSharedValue(0)
  const stretch = useSharedValue(0)
  const pillOpacity = useSharedValue(0)
  const lastHover = useSharedValue(-1)

  const pillLeft = (index: number, width: number) => ROW_PADDING + index * width + PILL_INSET

  useEffect(() => {
    if (!itemWidth) return
    if (focusedIndex === -1) {
      pillOpacity.value = withTiming(0, { duration: 120 })
      return
    }
    const target = pillLeft(focusedIndex, itemWidth)
    const wasHidden = pillOpacity.value === 0
    pillX.value = reduceMotion || wasHidden ? target : withSpring(target, PILL_SPRING)
    pillOpacity.value = withTiming(1, { duration: 120 })
  }, [focusedIndex, itemWidth, reduceMotion, pillX, pillOpacity])

  const onLayout = (event: LayoutChangeEvent) => {
    setItemWidth((event.nativeEvent.layout.width - ROW_PADDING * 2) / TABS.length)
  }

  const pan = useMemo(() => {
    const pillWidth = itemWidth - PILL_INSET * 2
    const hover = (index: number | null) => setHoverIndex(index)
    const select = (index: number) => {
      setHoverIndex(null)
      if (index !== focusedIndex) router.push(`/(tabs)/${TABS[index]?.segment ?? 'today'}` as Href)
      else if (itemWidth) pillX.value = withSpring(pillLeft(index, itemWidth), PILL_SPRING)
    }
    return Gesture.Pan()
      .enabled(itemWidth > 0)
      .activeOffsetX([-DRAG_START, DRAG_START])
      .onStart(() => {
        lastHover.value = -1
        pillOpacity.value = withTiming(1, { duration: 120 })
      })
      .onUpdate((event) => {
        const min = ROW_PADDING + PILL_INSET
        const max = ROW_PADDING + (TABS.length - 1) * itemWidth + PILL_INSET
        pillX.value = Math.min(max, Math.max(min, event.x - pillWidth / 2))
        if (!reduceMotion) stretch.value = Math.min(MAX_STRETCH, Math.abs(event.velocityX) / STRETCH_VELOCITY)
        const index = clampIndex(event.x, itemWidth)
        if (index !== lastHover.value) {
          lastHover.value = index
          runOnJS(hover)(index)
        }
      })
      .onEnd((event) => {
        stretch.value = withSpring(0, PILL_SPRING)
        runOnJS(select)(clampIndex(event.x, itemWidth))
      })
      .onFinalize((_event, success) => {
        if (!success) runOnJS(hover)(null)
      })
  }, [focusedIndex, itemWidth, lastHover, pillOpacity, pillX, reduceMotion, router, stretch])

  const pillStyle = useAnimatedStyle(() => ({
    opacity: pillOpacity.value,
    transform: [
      { translateX: pillX.value },
      { scaleX: 1 + stretch.value },
      { scaleY: 1 - stretch.value * 0.3 },
    ],
  }))

  const highlighted = hoverIndex ?? focusedIndex

  return (
    <View
      ref={coachRef('tab_bar')}
      collapsable={false}
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        bottom: bottomOffset,
        left: 20,
        right: 20,
        height: BAR_HEIGHT,
        borderRadius: radius.full,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.tabBorder,
        ...colors.shadowSoft,
      }}
    >
      <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={{ flex: 1 }}>
        <GestureDetector gesture={pan}>
          <View
            onLayout={onLayout}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: ROW_PADDING, backgroundColor: colors.tabBg }}
          >
            {/* Top shimmer */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0, left: 20, right: 20, height: 1,
                backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,1)',
              }}
            />

            {itemWidth > 0 && (
              <Animated.View
                pointerEvents="none"
                style={[
                  {
                    position: 'absolute',
                    left: 0,
                    top: (BAR_HEIGHT - 2 - PILL_HEIGHT) / 2,
                    width: itemWidth - PILL_INSET * 2,
                    height: PILL_HEIGHT,
                    borderRadius: PILL_HEIGHT / 2,
                    backgroundColor: `${activeColor}1F`,
                    borderWidth: 1,
                    borderColor: `${activeColor}40`,
                    overflow: 'hidden',
                  },
                  pillStyle,
                ]}
              >
                <View
                  style={{
                    position: 'absolute',
                    top: 0, left: 10, right: 10, height: 1,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.9)',
                  }}
                />
              </Animated.View>
            )}

            {TABS.map((tab, index) => {
              const isFocused = index === focusedIndex
              const isLit = index === highlighted
              return (
                <TouchableOpacity
                  key={tab.segment}
                  onPress={() => router.push(`/(tabs)/${tab.segment}` as Href)}
                  activeOpacity={0.7}
                  accessibilityRole="tab"
                  accessibilityLabel={t[tab.label]}
                  accessibilityState={{ selected: isFocused }}
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'center', height: PILL_HEIGHT, borderRadius: PILL_HEIGHT / 2 }}
                >
                  <Ionicons
                    name={(isLit ? tab.iconActive : tab.icon) as never}
                    size={22}
                    color={isLit ? activeColor : colors.tabInactive}
                  />
                </TouchableOpacity>
              )
            })}
          </View>
        </GestureDetector>
      </BlurView>
    </View>
  )
}
