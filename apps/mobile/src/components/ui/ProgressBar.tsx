import { View, Text } from 'react-native'
import { useTheme } from '../../contexts/ThemeContext'
import { radius, fontSize } from '../../theme/tokens'

interface Props {
  label: string
  value: number
  target: number
  unit?: string
  color: string
}

export function ProgressBar({ label, value, target, unit = 'g', color }: Props) {
  const { colors } = useTheme()
  const pct = target > 0 ? Math.min(value / target, 1) : 0
  const over = target > 0 && value > target

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: fontSize.sm, fontWeight: '500', color: colors.textSecondary }}>{label}</Text>
        <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: over ? '#EF4444' : colors.textMuted }}>
          {value}{unit} / {target}{unit}
        </Text>
      </View>
      <View style={{ height: 6, backgroundColor: colors.border, borderRadius: radius.full, overflow: 'hidden' }}>
        <View
          style={{
            height: '100%',
            width: `${pct * 100}%`,
            backgroundColor: over ? '#EF4444' : color,
            borderRadius: radius.full,
          }}
        />
      </View>
    </View>
  )
}
