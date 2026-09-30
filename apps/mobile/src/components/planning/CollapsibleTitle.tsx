import { View, Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme } from '@/src/contexts/ThemeContext'
import { palette, fontSize, fontWeight, spacing } from '@/src/theme/tokens'

interface Props {
  title: string
  /** Kapalıyken başlığın yanında görünen tek satırlık durum, ör. "1/3 tamam". */
  summary: string
  open: boolean
  onToggle: () => void
  onAdd: () => void
  addLabel: string
}

/** Haftalık kartların başlığı: kapalıyken tek satır özet, dokununca içerik açılır. */
export function CollapsibleTitle({ title, summary, open, onToggle, onAdd, addLabel }: Props) {
  const { colors } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginBottom: open ? spacing[3] : 0 }}>
      <TouchableOpacity onPress={onToggle} accessibilityState={{ expanded: open }} hitSlop={8}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.textPrimary }} numberOfLines={1}>{title}</Text>
        <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'right' }} numberOfLines={1}>{summary}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSubtle} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onAdd} accessibilityLabel={addLabel}
        style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: `${palette.accent}18`, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="add" size={18} color={palette.accent} />
      </TouchableOpacity>
    </View>
  )
}
