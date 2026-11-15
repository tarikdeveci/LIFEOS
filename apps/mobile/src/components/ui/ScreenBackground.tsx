import { useEffect, useState } from 'react'
import { Keyboard, Platform, type ViewStyle, type StyleProp } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../contexts/ThemeContext'

interface Props {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  edges?: Array<'top' | 'bottom' | 'left' | 'right'>
  /** Klavye açılınca içeriği klavyenin üstüne çeker (UX.md 2, #26). Kendi KeyboardAvoidingView'u olan ekran kapatır. */
  avoidKeyboard?: boolean
}

export function ScreenBackground({ children, style, edges = ['top'], avoidKeyboard = true }: Props) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const [keyboardHeight, setKeyboardHeight] = useState(0)

  useEffect(() => {
    if (!avoidKeyboard) return
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const show = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height))
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [avoidKeyboard])

  const bottomInset = edges.includes('bottom') ? insets.bottom : 0
  const keyboardPadding = keyboardHeight > 0 ? Math.max(keyboardHeight - bottomInset, 0) : 0

  return (
    <LinearGradient
      colors={colors.gradientColors as [string, string, ...string[]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <SafeAreaView edges={edges} style={[{ flex: 1 }, style, keyboardPadding > 0 && { paddingBottom: keyboardPadding }]}>
        {children}
      </SafeAreaView>
    </LinearGradient>
  )
}
