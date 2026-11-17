import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BackHandler, Pressable, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { create } from 'zustand'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius, MIN_TOUCH } from '@/src/theme/tokens'

/**
 * Gerçek ekran üstünde ipucu turu (coach mark). Ekran, gösterilecek öğeleri
 * CoachTarget ile sarar ve startCoach ile adımları verir; kök katmandaki
 * CoachOverlay öğeyi ölçer, çevresini karartır ve yanına kısa bir balon koyar.
 * Ölçüm gerçek konumdan yapıldığı için tur, ekranın kendisi değişse de doğru
 * yeri gösterir; tanıtım slaytlarındaki gibi temsili bir çizim değildir.
 */
export interface CoachStep {
  target: string
  title: string
  body: string
}

interface CoachState {
  steps: CoachStep[]
  index: number
  onDone: (() => void) | null
}

const useCoach = create<CoachState>(() => ({ steps: [], index: 0, onDone: null }))
const targets = new Map<string, View>()

export function startCoach(steps: CoachStep[], onDone: () => void): void {
  // Ekranda olmayan hedefler atlanır (ör. kapalı kart); tur yarıda takılmaz.
  const available = steps.filter((step) => targets.has(step.target))
  if (available.length === 0) { onDone(); return }
  useCoach.setState({ steps: available, index: 0, onDone })
}

function next(): void {
  const { index, steps } = useCoach.getState()
  if (index >= steps.length - 1) endCoach()
  else useCoach.setState({ index: index + 1 })
}

function endCoach(): void {
  const { onDone } = useCoach.getState()
  useCoach.setState({ steps: [], index: 0, onDone: null })
  onDone?.()
}

interface CoachTargetProps {
  id: string
  children: ReactNode
  style?: StyleProp<ViewStyle>
}

const refCallbacks = new Map<string, (node: View | null) => void>()

/** Bir görünümü tur hedefi olarak kaydeden sabit ref (sarmalayıcı eklenemeyen yerler için). */
export function coachRef(id: string): (node: View | null) => void {
  let cb = refCallbacks.get(id)
  if (!cb) {
    cb = (node) => {
      if (node) targets.set(id, node)
      else targets.delete(id)
    }
    refCallbacks.set(id, cb)
  }
  return cb
}

export function CoachTarget({ id, children, style }: CoachTargetProps) {
  return <View ref={coachRef(id)} collapsable={false} style={style}>{children}</View>
}

interface Rect { x: number; y: number; width: number; height: number }

const HOLE_PAD = 6
const DIM = 'rgba(0,0,0,0.62)'

export function CoachOverlay() {
  const { colors } = useTheme()
  const { t } = useLang()
  const reduceMotion = useReducedMotion()
  const { width: screenW, height: screenH } = useWindowDimensions()
  const steps = useCoach((s) => s.steps)
  const index = useCoach((s) => s.index)
  const step = steps[index]
  const [rect, setRect] = useState<Rect | null>(null)
  const first = useRef(true)
  const rootRef = useRef<View>(null)

  const x = useSharedValue(0)
  const y = useSharedValue(0)
  const w = useSharedValue(0)
  const h = useSharedValue(0)
  const pulse = useSharedValue(1)

  useEffect(() => {
    if (!step) { setRect(null); first.current = true; return }
    let last: Rect | null = null
    const measure = () => {
      const node = targets.get(step.target)
      if (!node) { next(); return }
      const root = rootRef.current
      if (!root) return
      // Android'de pencere koordinatı durum çubuğunun altından başlayabilir; katmanın kendi
      // konumu da ölçülüp çıkarılınca boşluk her iki platformda hedefin tam üstüne düşer.
      root.measureInWindow((ox, oy) => node.measureInWindow((mx, my, mw, mh) => {
        const r = { x: mx - ox - HOLE_PAD, y: my - oy - HOLE_PAD, width: mw + HOLE_PAD * 2, height: mh + HOLE_PAD * 2 }
        if (last && Math.abs(last.x - r.x) < 1 && Math.abs(last.y - r.y) < 1 && Math.abs(last.width - r.width) < 1 && Math.abs(last.height - r.height) < 1) return
        last = r
        // İlk adımda boşluk yerinde belirir, sonra hedef değiştikçe ya da kaydıkça onu izler.
        const duration = reduceMotion || first.current ? 0 : 320
        const easing = Easing.out(Easing.cubic)
        x.value = withTiming(r.x, { duration, easing })
        y.value = withTiming(r.y, { duration, easing })
        w.value = withTiming(r.width, { duration, easing })
        h.value = withTiming(r.height, { duration, easing })
        first.current = false
        setRect(r)
      }))
    }
    measure()
    // Üstteki bir kart veri gelince açılıp kapanabilir; tur açıkken hedef yeniden ölçülür.
    const timer = setInterval(measure, 400)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, reduceMotion])

  useEffect(() => {
    if (!step || reduceMotion) { cancelAnimation(pulse); pulse.value = 1; return }
    pulse.value = withRepeat(withSequence(withTiming(1.03, { duration: 700 }), withTiming(1, { duration: 700 })), -1)
    return () => cancelAnimation(pulse)
  }, [step, reduceMotion, pulse])

  useEffect(() => {
    if (!step) return
    // Donanım geri tuşu turu kapatır; kullanıcı arkadaki ekrandan çıkmaz.
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { endCoach(); return true })
    return () => sub.remove()
  }, [step])

  const topStyle = useAnimatedStyle(() => ({ top: 0, left: 0, right: 0, height: Math.max(0, y.value) }))
  const bottomStyle = useAnimatedStyle(() => ({ top: y.value + h.value, left: 0, right: 0, bottom: 0 }))
  const leftStyle = useAnimatedStyle(() => ({ top: y.value, left: 0, width: Math.max(0, x.value), height: h.value }))
  const rightStyle = useAnimatedStyle(() => ({ top: y.value, left: x.value + w.value, right: 0, height: h.value }))
  const ringStyle = useAnimatedStyle(() => ({
    top: y.value, left: x.value, width: w.value, height: h.value, transform: [{ scale: pulse.value }],
    // Yuvarlak düğmede halka da yuvarlak, kartta kartın köşesiyle aynı.
    borderRadius: Math.min(radius.xl + HOLE_PAD, Math.min(w.value, h.value) / 2),
  }))

  if (!step) return null

  const isLast = index === steps.length - 1
  // Balon öğenin altına sığıyorsa altta, sığmıyorsa üstte durur.
  const below = rect ? rect.y + rect.height / 2 < screenH / 2 : true
  const balloonPos: ViewStyle = rect
    ? below ? { top: rect.y + rect.height + spacing[3] } : { bottom: screenH - rect.y + spacing[3] }
    : { top: screenH / 3 }

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 1000 }]}
      entering={reduceMotion ? undefined : FadeIn.duration(200)}
      accessibilityViewIsModal
    >
      <View ref={rootRef} collapsable={false} pointerEvents="none" style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.dim, topStyle]} />
      <Animated.View style={[styles.dim, bottomStyle]} />
      <Animated.View style={[styles.dim, leftStyle]} />
      <Animated.View style={[styles.dim, rightStyle]} />
      <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
      {/* Vurgulanan öğeye dokunmak da sonraki adıma geçirir. */}
      {rect && (
        <Pressable
          onPress={next}
          accessibilityRole="button"
          accessibilityLabel={isLast ? t.ux_coach_done : t.ux_coach_next}
          style={{ position: 'absolute', top: rect.y, left: rect.x, width: rect.width, height: rect.height }}
        />
      )}
      <Animated.View
        key={index}
        entering={reduceMotion ? undefined : (below ? FadeInDown : FadeIn).duration(240)}
        style={[styles.balloon, balloonPos, { left: spacing[5], width: screenW - spacing[5] * 2, backgroundColor: colors.glassSolid, borderColor: colors.border }]}
      >
        <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginBottom: spacing[1] }}>
          {t.ux_coach_progress.replace('{n}', String(index + 1)).replace('{total}', String(steps.length))}
        </Text>
        <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary }}>{step.title}</Text>
        <Text style={{ fontSize: fontSize.base, color: colors.textSecondary, marginTop: spacing[1], lineHeight: 22 }}>{step.body}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing[4] }}>
          {isLast ? <View /> : (
            <Pressable onPress={endCoach} accessibilityRole="button" style={styles.textButton}>
              <Text style={{ fontSize: fontSize.base, color: colors.textMuted }}>{t.ux_coach_skip}</Text>
            </Pressable>
          )}
          <Pressable onPress={next} accessibilityRole="button" style={[styles.primary, { backgroundColor: palette.accent }]}>
            <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: '#fff' }}>
              {isLast ? t.ux_coach_done : t.ux_coach_next}
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', backgroundColor: DIM },
  ring: { position: 'absolute', borderWidth: 2, borderColor: palette.accent },
  balloon: { position: 'absolute', borderRadius: radius.xl, borderWidth: 1, padding: spacing[4] },
  textButton: { minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: spacing[2] },
  primary: { minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: spacing[5], borderRadius: radius.full },
})
