import type { ComponentProps } from 'react'
import { TouchableOpacity, Text, ActivityIndicator, type ViewStyle, type StyleProp } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme } from '../../contexts/ThemeContext'
import { palette, radius, fontSize, fontWeight, spacing } from '../../theme/tokens'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface Props {
  label: string
  onPress: () => void
  variant?: Variant
  size?: Size
  loading?: boolean
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  fullWidth?: boolean
  icon?: ComponentProps<typeof Ionicons>['name']
  accessibilityLabel?: string
}

const sizeMap = {
  sm: { px: spacing[3], py: spacing[2], fontSize: fontSize.sm, radius: radius.md },
  md: { px: spacing[5], py: 13, fontSize: fontSize.base, radius: radius.lg },
  lg: { px: spacing[6], py: 16, fontSize: fontSize.lg, radius: radius.xl },
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
  fullWidth = false,
  icon,
  accessibilityLabel,
}: Props) {
  const { colors, isDark } = useTheme()
  const s = sizeMap[size]
  const isDisabled = disabled || loading

  const bg: Record<Variant, string> = {
    primary: palette.accent,
    secondary: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(99,102,241,0.10)',
    ghost: 'transparent',
    danger: palette.danger,
  }

  const textColor: Record<Variant, string> = {
    primary: '#FFFFFF',
    secondary: isDark ? colors.textPrimary : palette.accent,
    ghost: colors.textMuted,
    danger: '#FFFFFF',
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          backgroundColor: bg[variant],
          borderRadius: s.radius,
          paddingHorizontal: s.px,
          paddingVertical: s.py,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          opacity: isDisabled ? 0.55 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(99,102,241,0.20)',
        },
        style,
      ]}
    >
      {loading && <ActivityIndicator size="small" color={textColor[variant]} />}
      {!loading && icon && <Ionicons name={icon} size={s.fontSize + 2} color={textColor[variant]} />}
      <Text style={{ fontSize: s.fontSize, fontWeight: fontWeight.semibold, color: textColor[variant] }}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}
