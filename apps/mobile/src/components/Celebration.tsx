import { useEffect, useMemo } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { create } from 'zustand'
import { palette } from '@/src/theme/tokens'

/**
 * iOS'ta modal ekran kök katmanın üstünde ayrı bir pencere gibi durur; modal içinden gelen
 * patlamayı modalın kendi katmanı çizer.
 */
type CelebrationScope = 'root' | 'modal'

interface CelebrationState {
  /** Her patlamada artar; katman bu sayının değişimini dinler. */
  burstId: number
  scope: CelebrationScope
  burst: (scope: CelebrationScope) => void
}

export const useCelebration = create<CelebrationState>((set) => ({
  burstId: 0,
  scope: 'root',
  burst: (scope) => set((state) => ({ burstId: state.burstId + 1, scope })),
}))

/** Görev, alışkanlık ya da rutin tamamlanınca kısa bir konfeti patlaması. */
export function celebrate(scope: CelebrationScope = 'root'): void {
  useCelebration.getState().burst(scope)
}

const PIECES = 28
const DURATION_MS = 1100
const GRAVITY = 900
const COLORS = [palette.accent, palette.accent2, palette.warning, palette.success, palette.meal, palette.info]

interface Piece {
  angle: number
  speed: number
  spin: number
  size: number
  color: string
  round: boolean
}

function makePieces(): Piece[] {
  return Array.from({ length: PIECES }, (_, i) => ({
    // Yukarı doğru yelpaze: -160 ile -20 derece arası.
    angle: (-160 + Math.random() * 140) * (Math.PI / 180),
    speed: 420 + Math.random() * 380,
    spin: (Math.random() - 0.5) * 720,
    size: 6 + Math.random() * 5,
    color: COLORS[i % COLORS.length] ?? palette.accent,
    round: i % 3 === 0,
  }))
}

function ConfettiPiece({ piece, progress, originX, originY }: { piece: Piece; progress: SharedValue<number>; originX: number; originY: number }) {
  const style = useAnimatedStyle(() => {
    const t = progress.value * (DURATION_MS / 1000)
    const x = Math.cos(piece.angle) * piece.speed * t
    const y = Math.sin(piece.angle) * piece.speed * t + 0.5 * GRAVITY * t * t
    return {
      opacity: progress.value < 0.75 ? 1 : 1 - (progress.value - 0.75) / 0.25,
      transform: [
        { translateX: originX + x },
        { translateY: originY + y },
        { rotate: `${piece.spin * progress.value}deg` },
      ],
    }
  })
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: piece.size,
          height: piece.round ? piece.size : piece.size * 0.45,
          borderRadius: piece.round ? piece.size / 2 : 1,
          backgroundColor: piece.color,
        },
        style,
      ]}
    />
  )
}

/**
 * Kök düzende bir kez çizilir; dokunuşları engellemez. Hareketi azalt açıksa hiç çizilmez.
 */
export function Celebration({ scope = 'root' }: { scope?: CelebrationScope }) {
  const burstId = useCelebration((s) => (s.scope === scope ? s.burstId : 0))
  const reduceMotion = useReducedMotion()
  const { width, height } = useWindowDimensions()
  const progress = useSharedValue(1)
  // Her patlamada yeni rastgele dağılım.
  const pieces = useMemo(() => (burstId > 0 ? makePieces() : []), [burstId])

  useEffect(() => {
    if (burstId === 0 || reduceMotion) return
    progress.value = 0
    progress.value = withTiming(1, { duration: DURATION_MS, easing: Easing.linear })
  }, [burstId, reduceMotion, progress])

  if (reduceMotion || pieces.length === 0) return null
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((piece, i) => (
        <ConfettiPiece key={`${burstId}-${i}`} piece={piece} progress={progress} originX={width / 2} originY={height * 0.55} />
      ))}
    </View>
  )
}
