import { View, Text, TouchableOpacity, type ViewStyle } from 'react-native'
import { useTheme } from '@/src/contexts/ThemeContext'
import { fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

interface Props<K extends string> {
  options: { key: K; label: string }[]
  value: K
  onChange: (key: K) => void
  style?: ViewStyle
}

/** Aynı içeriğin görünümleri arasında geçiş (ör. Gün / Hafta). */
export function Segmented<K extends string>({ options, value, onChange, style }: Props<K>) {
  const { colors } = useTheme()
  return (
    <View style={[{ flexDirection: 'row', backgroundColor: colors.glassInner, borderRadius: radius.lg, padding: 4, marginBottom: spacing[4] }, style]}>
      {options.map((o) => {
        const active = o.key === value
        return (
          <TouchableOpacity
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{ flex: 1, paddingVertical: 8, borderRadius: radius.md, alignItems: 'center', backgroundColor: active ? colors.bgSurface : 'transparent', ...(active ? colors.shadowCard : {}) }}
          >
            <Text style={{ fontSize: fontSize.sm, fontWeight: active ? fontWeight.semibold : fontWeight.regular, color: active ? colors.textPrimary : colors.textMuted }}>
              {o.label}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}
