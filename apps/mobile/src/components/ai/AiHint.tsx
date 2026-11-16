import { View, Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, radius, spacing, fontSize, hitSlopFor } from '@/src/theme/tokens'

interface AiHintProps {
  text: string
  onPress: () => void
  onClose: () => void
}

/** İşe yarayacağı anda tek satır AI ipucu. Sıklığı `useAiHint` sınırlar. */
export function AiHint({ text, onPress, onClose }: AiHintProps) {
  const { colors } = useTheme()
  const { t } = useLang()

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: `${palette.accent}30`, backgroundColor: `${palette.accent}10`, paddingLeft: spacing[3], marginBottom: spacing[3] }}>
      <TouchableOpacity onPress={onPress} accessibilityRole="button" activeOpacity={0.7} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[2], minHeight: 44 }}>
        <Ionicons name="sparkles" size={16} color={palette.accent} />
        <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.textPrimary }}>{text}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={t.ai_hint_close} hitSlop={hitSlopFor(44)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="close" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  )
}
