import { useEffect, useRef } from 'react'
import { Keyboard, Platform, ScrollView, TextInput, type View } from 'react-native'

// getInnerViewRef çalışma zamanında var ama RN tiplerinde yok.
interface ScrollWithInnerRef {
  getInnerViewRef(): View | null
}

interface Options {
  /**
   * Kısa formlar (giriş, kayıt): odaktaki alan üstte görünür kalırken içerik olabildiğince
   * aşağı kaydırılır, alandan sonraki gönder düğmesi klavyenin altında kalmaz.
   */
  revealFormEnd?: boolean
}

const TOP_GAP = 16

// Klavye açılınca odaktaki alanı (ve altındaki Kaydet düğmesini) görünür alana kaydırır (UX.md 2, #26).
// ScreenBackground ekranı klavyenin üstüne küçültür; kaydırmayı bu hook yapar.
export function useKeyboardScrollIntoView({ revealFormEnd = false }: Options = {}) {
  const scrollRef = useRef<ScrollView>(null)

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const sub = Keyboard.addListener(showEvent, () => {
      const input = TextInput.State.currentlyFocusedInput?.()
      const scroll = scrollRef.current
      const inner = (scroll as unknown as ScrollWithInnerRef | null)?.getInnerViewRef()
      if (!input || !scroll || !inner) return
      // Ekranın küçülmesi bitsin diye bir an beklenir.
      setTimeout(() => {
        input.measureLayout(
          inner,
          (_x, inputY) => {
            if (!revealFormEnd) {
              scroll.scrollTo({ y: Math.max(inputY - 160, 0), animated: true })
              return
            }
            const host = scroll.getNativeScrollRef()
            if (!host) return
            host.measure((_hx, _hy, _hw, viewportHeight) => {
              inner.measure((_cx, _cy, _cw, contentHeight) => {
                const maxScroll = Math.max(contentHeight - viewportHeight, 0)
                const y = Math.min(Math.max(inputY - TOP_GAP, 0), maxScroll)
                scroll.scrollTo({ y, animated: true })
              })
            })
          },
          () => undefined,
        )
      }, 100)
    })
    return () => sub.remove()
  }, [revealFormEnd])

  return scrollRef
}
