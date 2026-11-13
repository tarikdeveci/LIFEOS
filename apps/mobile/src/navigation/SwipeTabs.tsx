import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { BackHandler, View, useWindowDimensions } from 'react-native'
import { usePathname, useRouter, type Href } from 'expo-router'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { adjacentTab, edgeStep } from './tabOrder'

interface SwipeTabsProps {
  segments: readonly string[]
  children: ReactNode
}

const ACTIVATE_DISTANCE = 30
const VERTICAL_LIMIT = 20
const SWITCH_DISTANCE = 80
const SWITCH_VELOCITY = 600
const EDGE_BACK_WINDOW_MS = 1000

/**
 * Ana sekmeler arasında yatay kaydırma. Sekme içindeki yatay listeler gesture-handler'ın
 * `ScrollView`'unu kullanır: öteki türlü bu hareket listeyi keser. Android hareketli
 * gezinmede ekran kenarından başlayan kaydırma sistemin geri hareketi olarak gelir; dokunuşun
 * başladığı kenardan tanınır ve aynı sekme geçişine çevrilir, yoksa sekme geçmişinde yürür.
 */
export function SwipeTabs({ segments, children }: SwipeTabsProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { width } = useWindowDimensions()
  const lastTouch = useRef({ x: 0, at: 0 })
  const onMainTab = segments.includes(pathname.slice(1))

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

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(onMainTab)
        .activeOffsetX([-ACTIVATE_DISTANCE, ACTIVATE_DISTANCE])
        .failOffsetY([-VERTICAL_LIMIT, VERTICAL_LIMIT])
        .runOnJS(true)
        .onBegin((event) => {
          lastTouch.current = { x: event.absoluteX, at: Date.now() }
        })
        .onEnd((event, success) => {
          if (!success) return
          if (Math.abs(event.translationX) < SWITCH_DISTANCE && Math.abs(event.velocityX) < SWITCH_VELOCITY) return
          const next = adjacentTab(pathname, event.translationX < 0 ? 1 : -1, segments)
          if (next) router.push(`/(tabs)/${next}` as Href)
        }),
    [onMainTab, pathname, router, segments],
  )

  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1 }} collapsable={false}>
        {children}
      </View>
    </GestureDetector>
  )
}
