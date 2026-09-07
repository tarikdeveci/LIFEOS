import { TouchableOpacity, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme } from '../../contexts/ThemeContext'
import { palette } from '../../theme/tokens'

/**
 * Görev kartındaki tek dokunuşluk "tamamlandı" kutucuğu.
 *
 * Mobilde bir görevi bitirmenin tek yolu karta basıp detay ekranını açmak,
 * oradan durum seçmekti — üç dokunuş ve bir ekran geçişi. Web tarafında bu
 * kutucuk baştan beri vardı (`components/tasks/TaskCard.tsx`), mobilde yoktu.
 *
 * Dokunma alanı görselden büyük: 24px'lik bir daire parmakla ıskalanıyor.
 * hitSlop ile 44px'e çıkıyor (Apple'ın minimum hedef boyutu). Kutucuk kartın
 * TouchableOpacity'sinin İÇİNDE duruyor; React Native'de iç dokunma alanı
 * responder'ı kazandığı için kutucuğa basmak detay ekranını açmıyor.
 */
export function TaskCheckbox({
  done,
  onToggle,
  disabled = false,
}: {
  done: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  const { colors } = useTheme()
  return (
    <TouchableOpacity
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={done ? 'Tamamlandı işaretini kaldır' : 'Tamamlandı olarak işaretle'}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      activeOpacity={0.6}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: done ? palette.success : colors.borderStrong,
          backgroundColor: done ? palette.success : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : 1,
        }}
      >
        {done && <Ionicons name="checkmark" size={15} color="#fff" />}
      </View>
    </TouchableOpacity>
  )
}
