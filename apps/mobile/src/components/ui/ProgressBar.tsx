import { View, Text } from 'react-native'
import { useTheme } from '../../contexts/ThemeContext'
import { radius, fontSize, fontWeight } from '../../theme/tokens'

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
  const barColor = over ? '#EF4444' : color

  // Short display values — avoid long text that causes layout shifts
  const displayValue = unit === ' kcal' ? `${value}` : `${Math.round(value)}${unit}`
  const displayTarget = unit === ' kcal' ? `${target} kcal` : `${target}${unit}`

  return (
    <View style={{ gap: 5 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textSecondary, flex: 1 }}>
          {label}
        </Text>
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: over ? '#EF4444' : colors.textMuted, marginLeft: 8 }} numberOfLines={1}>
          {displayValue} / {displayTarget}
        </Text>
      </View>
      <View style={{ height: 7, backgroundColor: colors.border, borderRadius: radius.full, overflow: 'hidden' }}>
        <View
          style={{
            height: '100%',
            width: `${pct * 100}%`,
            backgroundColor: barColor,
            borderRadius: radius.full,
          }}
        />
      </View>
    </View>
  )
}
