import { TextInput, View, Text, type TextInputProps, type ViewStyle, type StyleProp } from 'react-native'
import { useTheme } from '../../contexts/ThemeContext'
import { radius, fontSize, spacing } from '../../theme/tokens'

interface Props extends TextInputProps {
  label?: string
  containerStyle?: StyleProp<ViewStyle>
}

export function Input({ label, containerStyle, style, ...props }: Props) {
  const { colors } = useTheme()

  return (
    <View style={containerStyle}>
      {label && (
        <Text style={{ fontSize: fontSize.sm, fontWeight: '500', color: colors.textMuted, marginBottom: spacing[1] }}>
          {label}
        </Text>
      )}
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
          style,
        ]}
        {...props}
      />
    </View>
  )
}
