import { useEffect, useRef } from 'react'
import { Keyboard, Platform, ScrollView, TextInput, type View } from 'react-native'

// getInnerViewRef çalışma zamanında var ama RN tiplerinde yok.
interface ScrollWithInnerRef {
  getInnerViewRef(): View | null
}

// Klavye açılınca odaktaki alanı (ve altındaki Kaydet düğmesini) görünür alana kaydırır (UX.md 2, #26).
// ScreenBackground ekranı klavyenin üstüne küçültür; kaydırmayı bu hook yapar.
export function useKeyboardScrollIntoView() {
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
          (_x, y) => scroll.scrollTo({ y: Math.max(y - 160, 0), animated: true }),
          () => undefined,
        )
      }, 100)
    })
    return () => sub.remove()
  }, [])

  return scrollRef
}
