import { View, type ViewStyle, type StyleProp } from 'react-native'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../../contexts/ThemeContext'
import { radius } from '../../theme/tokens'

interface Props {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  intensity?: number
  padding?: number
  borderRadius?: number
  noShadow?: boolean
}

export function GlassCard({
  children,
  style,
  intensity,
  padding = 16,
  borderRadius = radius.xl,
  noShadow = false,
}: Props) {
  const { colors, isDark } = useTheme()
  const blurIntensity = intensity ?? (isDark ? 35 : 60)

  const shadowStyle = noShadow ? {} : colors.shadowCard

  return (
    <View
      style={[
        {
          borderRadius,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.glassBorder,
        },
        shadowStyle,
        style,
      ]}
    >
      <BlurView intensity={blurIntensity} tint={isDark ? 'dark' : 'light'} style={{ flex: 1 }}>
        <LinearGradient
          colors={
            isDark
              ? ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.02)']
              : ['rgba(255,255,255,0.80)', 'rgba(255,255,255,0.45)']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ padding }}
        >
          {/* Top shimmer line */}
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 16,
              right: 16,
              height: 1,
              backgroundColor: colors.glassShimmer,
            }}
          />
          {children}
        </LinearGradient>
      </BlurView>
    </View>
  )
}
