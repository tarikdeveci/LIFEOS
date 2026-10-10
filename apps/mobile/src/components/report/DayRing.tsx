import type { ReactNode } from 'react'
import { View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import Animated, { useAnimatedProps } from 'react-native-reanimated'
import { useTheme } from '@/src/contexts/ThemeContext'
import { palette } from '@/src/theme/tokens'
import { clamp01, type Progress } from './motion'
import type { RingTone } from '@lifeos/shared'

interface Props {
  /** Günün işleri sırasıyla; her dilim bir iş. */
  tones: RingTone[]
  size: number
  /** 0'dan 1'e: dilimler saat yönünde sırayla dolar. */
  sweep: Progress
  accessibilityLabel: string
  children?: ReactNode
}

interface SegmentProps {
  index: number
  count: number
  tone: Exclude<RingTone, 'rest'>
  sweep: Progress
  center: number
  radius: number
  /** Dilimin yay uzunluğu ve çemberin tamamı. */
  arc: number
  circumference: number
  color: string
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle)
const STROKE = 10
/** Dilimler arası boşluk (yay uzunluğu). */
const GAP = 4
const PARTIAL_OPACITY = 0.42

function Segment({ index, count, tone, sweep, center, radius, arc, circumference, color }: SegmentProps) {
  const strength = tone === 'done' ? 1 : PARTIAL_OPACITY
  const animatedProps = useAnimatedProps(() => ({
    strokeOpacity: strength * clamp01(sweep.value * count - index),
  }))

  return (
    <AnimatedCircle
      cx={center}
      cy={center}
      r={radius}
      fill="none"
      stroke={color}
      strokeWidth={STROKE}
      strokeDasharray={[arc, circumference - arc]}
      rotation={-90 + (index * 360) / count}
      origin={`${center}, ${center}`}
      animatedProps={animatedProps}
    />
  )
}

/**
 * Günün halkası: her dilim planlı bir iş, sırası günün sırası. Tamamlanan dolu, yarım kalan
 * soluk, gerisi iz olarak kalır. Yüzde göstermez; günün neresinin dolduğunu gösterir.
 */
export function DayRing({ tones, size, sweep, accessibilityLabel, children }: Props) {
  const { isDark } = useTheme()
  const center = size / 2
  const radius = (size - STROKE) / 2
  const circumference = 2 * Math.PI * radius
  const count = Math.max(tones.length, 1)
  const slot = circumference / count
  const arc = count > 1 ? slot - GAP : circumference
  const color = isDark ? palette.accent2 : palette.accent
  const track = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.10)'

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={track}
          strokeWidth={STROKE}
          strokeDasharray={count > 1 ? [arc, GAP] : undefined}
          rotation={-90}
          origin={`${center}, ${center}`}
        />
        {tones.map((tone, index) =>
          tone === 'rest' ? null : (
            <Segment
              key={index}
              index={index}
              count={count}
              tone={tone}
              sweep={sweep}
              center={center}
              radius={radius}
              arc={arc}
              circumference={circumference}
              color={color}
            />
          ),
        )}
      </Svg>
      {children}
    </View>
  )
}
