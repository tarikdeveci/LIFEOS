import { View, Text } from 'react-native'
import { useTheme } from '../../contexts/ThemeContext'
import { radius, fontSize, spacing } from '../../theme/tokens'

interface Props {
  label: string
  value: string | number
  color?: string
  flex?: number
}

export function StatCard({ label, value, color, flex = 1 }: Props) {
  const { colors } = useTheme()
  const tint = color ?? colors.textPrimary
  const bg = color ? `${color}14` : colors.glassInner
  const border = color ? `${color}28` : colors.border

  return (
    <View
      style={{
        flex,
        backgroundColor: bg,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: border,
        padding: spacing[3],
        gap: 4,
      }}
    >
      <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, fontWeight: '500' }}>{label}</Text>
      <Text style={{ fontSize: fontSize.xl, fontWeight: '800', color: tint }}>{value}</Text>
    </View>
  )
}
