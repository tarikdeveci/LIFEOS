import { TextInput, TouchableOpacity, View, Text, type TextInputProps, type ViewStyle, type StyleProp } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme } from '../../contexts/ThemeContext'
import { radius, fontSize, spacing } from '../../theme/tokens'

interface BaseProps extends TextInputProps {
  label?: string
  containerStyle?: StyleProp<ViewStyle>
}

/** onClear verilirse kutu doluyken sağda bir temizle (×) düğmesi çıkar; ekran okuyucu etiketi zorunlu. */
type Props = BaseProps & ({ onClear?: undefined; clearLabel?: undefined } | { onClear: () => void; clearLabel: string })

export function Input({ label, containerStyle, style, onClear, clearLabel, ...props }: Props) {
  const { colors } = useTheme()
  const showClear = !!onClear && !!props.value

  return (
    <View style={containerStyle}>
      {label && (
        <Text style={{ fontSize: fontSize.sm, fontWeight: '500', color: colors.textMuted, marginBottom: spacing[1] }}>
          {label}
        </Text>
      )}
      <View style={{ justifyContent: 'center' }}>
        <TextInput
          placeholderTextColor={colors.inputPlaceholder}
          style={[
            {
              backgroundColor: colors.inputBg,
              borderWidth: 1,
              borderColor: colors.inputBorder,
              borderRadius: radius.lg,
              paddingHorizontal: spacing[4],
              paddingVertical: 13,
              fontSize: fontSize.base,
              color: colors.inputText,
            },
            showClear && { paddingRight: spacing[10] },
            style,
          ]}
          {...props}
        />
        {showClear && (
          <TouchableOpacity
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel={clearLabel}
            hitSlop={12}
            style={{ position: 'absolute', right: spacing[3] }}
          >
            <Ionicons name="close-circle" size={20} color={colors.textSubtle} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}
