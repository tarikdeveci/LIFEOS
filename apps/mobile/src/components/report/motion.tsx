// Gün raporunun kaydırmaya bağlı hareketi. Tek kaynak kaydırma konumudur: bölüm ekrana
// girdikçe açılır, geri kaydırınca geri sarar. Zamanlayıcıyla dönen, kendi kendine oynayan
// hareket yok. Sistemde "hareketi azalt" açıksa her şey yerinde durur.
import { createContext, useContext, type ReactNode } from 'react'
import { View, type LayoutChangeEvent, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated'

/** 0: henüz açılmadı, 1: yerine oturdu. */
export type Progress = DerivedValue<number>

export interface StoryScroll {
  scrollY: SharedValue<number>
  /** Kaydırma alanının görünen yüksekliği. */
  viewport: SharedValue<number>
  /** İçeriğin toplam yüksekliği. */
  content: SharedValue<number>
  reduced: boolean
}

interface StoryProviderProps {
  value: StoryScroll
  children: ReactNode
}

interface RevealProps {
  children: ReactNode | ((progress: Progress) => ReactNode)
  style?: StyleProp<ViewStyle>
}

interface RiseTextProps {
  progress: Progress
  text: string
  style: StyleProp<TextStyle>
  /** Açılma oranının bu aralığında yükselir. */
  from?: number
  to?: number
}

const StoryContext = createContext<StoryScroll | null>(null)
/** İç içe açılmada üst bölümün içerik içindeki y konumu. */
const OffsetContext = createContext<DerivedValue<number> | null>(null)

/** Bölümün üst kenarı ekranın altından bu kadar içeri girince açılma başlar. */
const LEAD = 24
/** Açılma, ekran yüksekliğinin bu oranı kadar kaydırmada tamamlanır. */
const SPAN = 0.22
const RISE = 18

export function StoryProvider({ value, children }: StoryProviderProps) {
  return <StoryContext.Provider value={value}>{children}</StoryContext.Provider>
}

export function useStory(): StoryScroll {
  const story = useContext(StoryContext)
  if (!story) throw new Error('useStory, StoryProvider içinde kullanılmalı')
  return story
}

export function clamp01(value: number): number {
  'worklet'
  return Math.min(Math.max(value, 0), 1)
}

/**
 * Bölümün açılma oranı. onLayout, kaydırma içeriğinin (ya da üstteki Reveal'in) doğrudan
 * çocuğu olan görünüme bağlanmalı: y konumu ona göre okunur.
 */
export function useReveal() {
  const { scrollY, viewport, content, reduced } = useStory()
  const parent = useContext(OffsetContext)
  const local = useSharedValue(-1)
  const top = useDerivedValue(() => (parent ? parent.value : 0) + local.value)

  const progress = useDerivedValue(() => {
    // Ölçülmeden önce görünür kalır: ölçüm gelmezse ekran boş kalmasın.
    if (reduced || local.value < 0 || viewport.value <= 0) return 1
    const span = viewport.value * SPAN
    const start = top.value - viewport.value + LEAD
    // İçeriğin sonundaki bölüm tam yol alamaz; kaydırma bitmeden açılmış olsun.
    const end = Math.min(start + span, Math.max(content.value - viewport.value, 0))
    const from = Math.min(start, end - span / 2)
    return clamp01((scrollY.value - from) / (end - from))
  })

  const onLayout = (event: LayoutChangeEvent) => {
    local.value = event.nativeEvent.layout.y
  }
  return { progress, top, onLayout }
}

/** Ekrana girerken beliren ve yerine oturan bölüm. Çocuk fonksiyonsa açılma oranını alır. */
export function Reveal({ children, style }: RevealProps) {
  const { progress, top, onLayout } = useReveal()
  const animated = useAnimatedStyle(() => ({
    opacity: Math.min(progress.value * 1.6, 1),
    transform: [{ translateY: (1 - progress.value) * RISE }],
  }))

  return (
    <OffsetContext.Provider value={top}>
      <Animated.View onLayout={onLayout} style={[style, animated]}>
        {typeof children === 'function' ? children(progress) : children}
      </Animated.View>
    </OffsetContext.Provider>
  )
}

/**
 * Sayı yerine oturur: maskenin altından yükselir. Değer baştan sona doğrudur, ara değer
 * gösterilmez (sayarak artan rakam, kaydırma yarıda kalınca yanlış sayı gösterirdi).
 */
export function RiseText({ progress, text, style, from = 0.2, to = 1 }: RiseTextProps) {
  const animated = useAnimatedStyle(() => {
    const p = clamp01((progress.value - from) / (to - from))
    return { opacity: p, transform: [{ translateY: (1 - p) * RISE }] }
  })

  return (
    <View style={{ overflow: 'hidden' }}>
      <Animated.Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[style, animated]}>
        {text}
      </Animated.Text>
    </View>
  )
}
