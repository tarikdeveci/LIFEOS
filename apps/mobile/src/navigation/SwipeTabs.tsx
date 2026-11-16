import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { BackHandler, View, useWindowDimensions } from 'react-native'
import { usePathname, useRouter, type Href } from 'expo-router'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { adjacentTab, edgeStep } from './tabOrder'

interface SwipeTabsProps {
  segments: readonly string[]
  children: ReactNode
  /** Kayan içeriğin dışında, yerinde duran katman (sekme çubuğu). */
  overlay?: ReactNode
}

const ACTIVATE_DISTANCE = 30
const VERTICAL_LIMIT = 20
const SWITCH_DISTANCE = 80
const SWITCH_VELOCITY = 600
const EDGE_BACK_WINDOW_MS = 1000
/** Sıranın ucunda gidilecek sekme yokken sayfa parmağı bu oranda direnerek izler. */
const EDGE_RESISTANCE = 0.25
/** Geçişte eski sayfanın ekran genişliğine oranla kayacağı mesafe; kalanını sekme animasyonu tamamlar. */
const EXIT_SHIFT = 0.35
const EXIT_MS = 140
const SETTLE_SPRING = { damping: 22, stiffness: 260, mass: 0.9 }

/**
 * Ana sekmeler arasında yatay kaydırma. Sayfa parmağı izler; bırakınca ya geri yerine yaylanır
 * ya da kayıp solarak çıkar ve sıradaki sekme `shift` animasyonuyla gelir. Sekme içindeki yatay
 * listeler gesture-handler'ın `ScrollView`'unu kullanır: öteki türlü bu hareket listeyi keser.
 * Android hareketli gezinmede ekran kenarından başlayan kaydırma sistemin geri hareketi olarak
 * gelir; dokunuşun başladığı kenardan tanınır ve aynı sekme geçişine çevrilir.
 */
export function SwipeTabs({ segments, children, overlay }: SwipeTabsProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { width } = useWindowDimensions()
  const reduceMotion = useReducedMotion()
  const lastTouch = useRef({ x: 0, at: 0 })
  const onMainTab = segments.includes(pathname.slice(1))
  const index = segments.indexOf(pathname.slice(1))
  const translateX = useSharedValue(0)
  const opacity = useSharedValue(1)

  // Yeni sekme açıldığında kap yerine döner; gelen sayfanın kayışını sekme animasyonu yapar.
  useEffect(() => {
    translateX.value = 0
    opacity.value = 1
  }, [pathname, translateX, opacity])

  useEffect(() => {
    if (!onMainTab) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const { x, at } = lastTouch.current
      const step = Date.now() - at < EDGE_BACK_WINDOW_MS ? edgeStep(x, width) : null
      if (!step) return false
      const next = adjacentTab(pathname, step, segments)
      if (next) router.push(`/(tabs)/${next}` as Href)
      else if (step === -1) BackHandler.exitApp()
      return true
    })
    return () => subscription.remove()
  }, [onMainTab, pathname, router, segments, width])

  const pan = useMemo(() => {
    const hasPrev = index > 0
    const hasNext = index !== -1 && index < segments.length - 1
    const markTouch = (x: number) => {
      lastTouch.current = { x, at: Date.now() }
    }
    const go = (step: 1 | -1) => {
      const next = adjacentTab(pathname, step, segments)
      if (next) router.push(`/(tabs)/${next}` as Href)
    }
    return Gesture.Pan()
      .enabled(onMainTab)
      .activeOffsetX([-ACTIVATE_DISTANCE, ACTIVATE_DISTANCE])
      .failOffsetY([-VERTICAL_LIMIT, VERTICAL_LIMIT])
      .onBegin((event) => {
        runOnJS(markTouch)(event.absoluteX)
      })
      .onUpdate((event) => {
        if (reduceMotion) return
        const dx = event.translationX
        const blocked = (dx < 0 && !hasNext) || (dx > 0 && !hasPrev)
        translateX.value = blocked ? dx * EDGE_RESISTANCE : dx
      })
      .onEnd((event, success) => {
        const dx = event.translationX
        const step: 1 | -1 = dx < 0 ? 1 : -1
        const allowed = step === 1 ? hasNext : hasPrev
        const far = Math.abs(dx) >= SWITCH_DISTANCE || Math.abs(event.velocityX) >= SWITCH_VELOCITY
        if (!success || !far || !allowed) {
          translateX.value = withSpring(0, SETTLE_SPRING)
          return
        }
        if (reduceMotion) {
          runOnJS(go)(step)
          return
        }
        opacity.value = withTiming(0, { duration: EXIT_MS })
        translateX.value = withTiming(-step * width * EXIT_SHIFT, { duration: EXIT_MS }, (finished) => {
          if (finished) runOnJS(go)(step)
        })
      })
  }, [index, onMainTab, opacity, pathname, reduceMotion, router, segments, translateX, width])

  const pageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }))

  return (
    <View style={{ flex: 1 }}>
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ flex: 1 }, pageStyle]} collapsable={false}>
          {children}
        </Animated.View>
      </GestureDetector>
      {overlay}
    </View>
  )
}
