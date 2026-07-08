import { Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const TAB_BAR_HEIGHT = 64

export function useBottomTabPadding(extra = 24): number {
  const insets = useSafeAreaInsets()
  const bottomOffset = Math.max(insets.bottom + 8, Platform.OS === 'ios' ? 28 : 16)

  return TAB_BAR_HEIGHT + bottomOffset + extra
}
