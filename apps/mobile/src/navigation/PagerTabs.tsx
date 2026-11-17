import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BackHandler, StyleSheet, View, useWindowDimensions } from 'react-native'
import {
  createNavigatorFactory,
  TabRouter,
  useNavigationBuilder,
  type DefaultNavigatorOptions,
  type ParamListBase,
  type TabActionHelpers,
  type TabNavigationState,
  type TabRouterOptions,
} from '@react-navigation/native'
import { withLayoutContext } from 'expo-router'
import { Freeze } from 'react-freeze'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  FadeOut,
  SlideInRight,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useTheme } from '@/src/contexts/ThemeContext'
import { edgeStep } from './tabOrder'

interface PagerOptions {
  title?: string
}

// Sekme olayı yok; boş olay haritası.
type PagerEventMap = Record<never, never>

type PagerNavigatorProps = DefaultNavigatorOptions<
  ParamListBase,
  string | undefined,
  TabNavigationState<ParamListBase>,
  PagerOptions,
  PagerEventMap,
  unknown
> &
  TabRouterOptions & {
    /** Yan yana dizilen ana sayfalar; kaydırma bu sırayı izler. */
    pages: readonly string[]
    /** Sayfaların üstünde yerinde duran katman (sekme çubuğu). */
    overlay?: ReactNode
  }

const ACTIVATE_DISTANCE = 20
const VERTICAL_LIMIT = 20
/** Bırakınca sıradaki sayfaya geçmek için gereken mesafe (sayfa genişliğine oran) ya da hız. */
const SWITCH_RATIO = 0.22
const SWITCH_VELOCITY = 500
/** Sıranın ucunda gidilecek sayfa yokken sayfa parmağı bu oranda direnerek izler. */
const EDGE_RESISTANCE = 0.25
const SETTLE_SPRING = { damping: 30, stiffness: 260, mass: 1, overshootClamping: true }
const STEP_TIMING = { duration: 280, easing: Easing.out(Easing.cubic) }
const JUMP_FADE_MS = 180
const OVERLAY_IN_MS = 240
const OVERLAY_OUT_MS = 160
/** Komşu sayfalar, geçiş animasyonu bittikten sonra hazırlanır: geçişin ortasında iş yapılmaz. */
const NEIGHBOR_DELAY_MS = 350
const EDGE_BACK_WINDOW_MS = 1000

/**
 * Ana sekmeleri yan yana dizen sayfa gezgini. Parmak sürüklerken hem mevcut hem sıradaki sayfa
 * birlikte kayar, bırakınca hıza göre yaylanarak oturur; animasyon tamamen UI iş parçacığında
 * çalışır. Sayfalar bir kez açılınca bağlı kalır, komşular önceden hazırlanır, uzaktaki sayfalar
 * dondurulur (arka planda yeniden çizilmez). Ana sırada olmayan rotalar (profil, ayarlar) sayfaların
 * üstünde sağdan kayarak açılır.
 */
function PagerNavigator({
  id,
  initialRouteName,
  backBehavior,
  children,
  screenListeners,
  screenOptions,
  pages,
  overlay,
}: PagerNavigatorProps) {
  const { state, descriptors, navigation, NavigationContent } = useNavigationBuilder<
    TabNavigationState<ParamListBase>,
    TabRouterOptions,
    TabActionHelpers<ParamListBase>,
    PagerOptions,
    PagerEventMap
  >(TabRouter, { id, initialRouteName, backBehavior, children, screenListeners, screenOptions })

  const { width } = useWindowDimensions()
  const { colors } = useTheme()
  const reduceMotion = useReducedMotion()
  const lastTouch = useRef({ x: 0, at: 0 })

  const focused = state.routes[state.index]
  const focusedPage = focused ? pages.indexOf(focused.name) : -1
  const onMainPage = focusedPage !== -1

  // Kaplama (profil, ayarlar) açıkken altta son ana sayfa kalır.
  const [page, setPage] = useState(Math.max(0, focusedPage))
  if (onMainPage && focusedPage !== page) setPage(focusedPage)

  const [loaded, setLoaded] = useState<ReadonlySet<number>>(() => new Set([page]))
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoaded((prev) => {
        const wanted = [page - 1, page, page + 1].filter((i) => i >= 0 && i < pages.length)
        if (wanted.every((i) => prev.has(i))) return prev
        return new Set([...prev, ...wanted])
      })
    }, NEIGHBOR_DELAY_MS)
    return () => clearTimeout(timer)
  }, [page, pages.length])

  const position = useSharedValue(page)
  const target = useSharedValue(page)
  const dragStart = useSharedValue(page)
  const fade = useSharedValue(1)

  // Sekme çubuğu ya da bağlantıyla gelen geçiş: komşuya kayarak, uzağa solarak.
  useEffect(() => {
    if (target.value === page) return
    target.value = page
    const far = Math.abs(position.value - page) > 1.01
    if (reduceMotion || far) {
      cancelAnimation(position)
      position.value = page
      if (!reduceMotion) {
        fade.value = 0
        fade.value = withTiming(1, { duration: JUMP_FADE_MS })
      }
      return
    }
    position.value = withTiming(page, STEP_TIMING)
  }, [page, reduceMotion, position, target, fade])

  // Android hareketli gezinmede ekran kenarından başlayan kaydırma sistemin geri hareketi olarak
  // gelir; dokunuşun başladığı kenardan tanınır ve sayfa geçişine çevrilir.
  useEffect(() => {
    if (!onMainPage) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const { x, at } = lastTouch.current
      const step = Date.now() - at < EDGE_BACK_WINDOW_MS ? edgeStep(x, width) : null
      if (!step) return false
      const next = pages[page + step]
      if (next) navigation.navigate(next)
      else if (step === -1) BackHandler.exitApp()
      return true
    })
    return () => subscription.remove()
  }, [onMainPage, page, pages, navigation, width])

  const pan = useMemo(() => {
    const last = pages.length - 1
    const markTouch = (x: number) => {
      lastTouch.current = { x, at: Date.now() }
    }
    const goTo = (index: number) => {
      const name = pages[index]
      if (name) navigation.navigate(name)
    }
    return Gesture.Pan()
      .enabled(onMainPage && width > 0)
      .activeOffsetX([-ACTIVATE_DISTANCE, ACTIVATE_DISTANCE])
      .failOffsetY([-VERTICAL_LIMIT, VERTICAL_LIMIT])
      .onBegin((event) => {
        runOnJS(markTouch)(event.absoluteX)
      })
      .onStart(() => {
        cancelAnimation(position)
        dragStart.value = position.value
      })
      .onUpdate((event) => {
        if (reduceMotion) return
        const raw = dragStart.value - event.translationX / width
        if (raw < 0) position.value = raw * EDGE_RESISTANCE
        else if (raw > last) position.value = last + (raw - last) * EDGE_RESISTANCE
        else position.value = raw
      })
      .onEnd((event, success) => {
        const base = target.value
        const moved = dragStart.value - event.translationX / width - base
        let next = base
        if (success) {
          const forward = event.velocityX <= -SWITCH_VELOCITY || (moved >= SWITCH_RATIO && event.velocityX < SWITCH_VELOCITY)
          const backward = event.velocityX >= SWITCH_VELOCITY || (moved <= -SWITCH_RATIO && event.velocityX > -SWITCH_VELOCITY)
          if (forward) next = base + 1
          else if (backward) next = base - 1
        }
        next = Math.min(last, Math.max(0, next))
        target.value = next
        if (reduceMotion) position.value = next
        else position.value = withSpring(next, { ...SETTLE_SPRING, velocity: -event.velocityX / width })
        if (next !== base) runOnJS(goTo)(next)
      })
  }, [onMainPage, width, pages, navigation, reduceMotion, position, target, dragStart])

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -position.value * width }] }))
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }))

  return (
    <NavigationContent>
      <View style={[styles.fill, styles.clip, { backgroundColor: colors.bg }]}>
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.fill, fadeStyle]}>
            {/* Sıra tüm sayfaları kapsayacak kadar geniş olmalı: Android dokunuşu ebeveynin sınırı
                dışındaki görünüme iletmez, dar sırada ilk sayfa dışındakiler kaydırılamıyordu. */}
            <Animated.View style={[styles.fill, { width: pages.length * width }, rowStyle]}>
              {pages.map((name, index) => {
                const route = state.routes.find((r) => r.name === name)
                if (!route || !(index === page || loaded.has(index))) return null
                const active = onMainPage && index === page
                return (
                  <View
                    key={route.key}
                    pointerEvents={active ? 'auto' : 'none'}
                    importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
                    accessibilityElementsHidden={!active}
                    style={[styles.page, { left: index * width, width, backgroundColor: colors.bg }]}
                  >
                    <Freeze freeze={Math.abs(index - page) > 1}>{descriptors[route.key]?.render()}</Freeze>
                  </View>
                )
              })}
            </Animated.View>
          </Animated.View>
        </GestureDetector>
        {focused && !onMainPage && (
          <Animated.View
            key={focused.key}
            entering={reduceMotion ? undefined : SlideInRight.duration(OVERLAY_IN_MS).easing(Easing.out(Easing.cubic))}
            exiting={reduceMotion ? undefined : FadeOut.duration(OVERLAY_OUT_MS)}
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}
          >
            {descriptors[focused.key]?.render()}
          </Animated.View>
        )}
        {overlay}
      </View>
    </NavigationContent>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  clip: { overflow: 'hidden' },
  page: { position: 'absolute', top: 0, bottom: 0 },
})

export const PagerTabs = withLayoutContext(createNavigatorFactory(PagerNavigator)().Navigator)
