import { useMemo, type ReactNode } from 'react'
import { Platform, View } from 'react-native'
import { usePathname } from 'expo-router'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import { swipeBackEnabled } from './backRoutes'
import { useGoBack } from './useGoBack'

interface SwipeBackProps { children: ReactNode }

const EDGE_WIDTH = 24
const ACTIVATE_DISTANCE = 12
const VERTICAL_LIMIT = 24
const BACK_DISTANCE = 80
const BACK_VELOCITY = 600

/**
 * Tüm uygulamayı sarar: sol kenardan sağa kaydırmak geri gider. Yalnız kenardan başlayan
 * hareketi dinler, yatay listeler etkilenmez. Android hareketli gezinmede sistem geri
 * hareketi dokunuşu alır, burası iptal görür ve ikinci kez geri gitmez.
 */
export function SwipeBack({ children }: SwipeBackProps) {
  const pathname = usePathname()
  const goBack = useGoBack()

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(swipeBackEnabled(pathname, Platform.OS))
        .hitSlop({ left: 0, width: EDGE_WIDTH })
        .activeOffsetX(ACTIVATE_DISTANCE)
        .failOffsetY([-VERTICAL_LIMIT, VERTICAL_LIMIT])
        .runOnJS(true)
        .onEnd((event, success) => {
          if (success && (event.translationX > BACK_DISTANCE || event.velocityX > BACK_VELOCITY)) goBack()
        }),
    [pathname, goBack],
  )

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GestureDetector gesture={pan}>
        <View style={{ flex: 1 }} collapsable={false}>
          {children}
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  )
}
