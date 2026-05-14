import { View, type ViewStyle, type StyleProp } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '../../contexts/ThemeContext'

interface Props {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  edges?: Array<'top' | 'bottom' | 'left' | 'right'>
}

export function ScreenBackground({ children, style, edges = ['top'] }: Props) {
  const { colors } = useTheme()

  return (
    <LinearGradient
      colors={colors.gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <SafeAreaView edges={edges} style={[{ flex: 1 }, style]}>
        {children}
      </SafeAreaView>
    </LinearGradient>
  )
}
