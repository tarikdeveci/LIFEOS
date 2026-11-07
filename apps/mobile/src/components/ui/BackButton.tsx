import { TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useLang } from '../../contexts/LangContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useGoBack } from '../../navigation/useGoBack'
import { spacing } from '../../theme/tokens'

interface BackButtonProps {
  /** Geri dönmeden önce iş yapan ekranlar için; verilmezse ekranın açıldığı yere döner. */
  onPress?: () => void
}

export function BackButton({ onPress }: BackButtonProps) {
  const { colors } = useTheme()
  const { t } = useLang()
  const goBack = useGoBack()
  return (
    <TouchableOpacity
      onPress={onPress ?? goBack}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={t.back}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing[2] }}
    >
      <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
    </TouchableOpacity>
  )
}
