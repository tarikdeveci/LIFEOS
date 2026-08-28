import { useEffect, useState } from 'react'
import { Modal, View, TouchableOpacity, ScrollView, Text, Keyboard, Platform, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../contexts/ThemeContext'
import { radius, spacing, fontSize, fontWeight } from '../../theme/tokens'

interface Props {
  visible: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  scrollable?: boolean
}

export function BottomSheet({ visible, onClose, title, children, scrollable = false }: Props) {
  const { colors } = useTheme()
  const { height: screenHeight } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const bottomOffset = keyboardHeight > 0 ? Math.max(keyboardHeight - insets.bottom, 0) : insets.bottom

  // Sayfa flex-end ile klavyenin üstüne yaslanır, dolayısıyla kullanabileceği
  // alan yalnızca bu kadardır. Eski hesapta `Math.max(screenHeight * 0.45, ...)`
  // tabanı vardı: klavye ekrana oranla yüksek olduğunda (küçük telefonlar) bu
  // taban mevcut alanı aşıyor ve sayfayı YUKARIDAN kırpıyordu — başlık ve
  // kapatma düğmesi ekran dışında kalıyordu. Taban kaldırıldı; içerik zaten
  // kısa olduğunda sayfa kendiliğinden küçülür.
  const available = screenHeight - bottomOffset - spacing[4]
  const sheetMaxHeight = Math.min(available, screenHeight * 0.92)

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const show = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height))
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0))
    return () => { show.remove(); hide.remove() }
  }, [])

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {/*
        paddingBottom pushes the flex-end anchor up above the keyboard.
        The sheet's bottom edge lands exactly at the keyboard top.
      */}
      <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: bottomOffset }}>
        {/* Tap-to-close backdrop — absolute so it covers the full screen including keyboard area */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.50)' }}
        />

        {/* Sheet */}
        <View
          style={{
            backgroundColor: colors.bgElevated,
            borderTopLeftRadius: radius['2xl'],
            borderTopRightRadius: radius['2xl'],
            borderTopWidth: 1,
            borderLeftWidth: 1,
            borderRightWidth: 1,
            borderColor: colors.glassBorder,
            maxHeight: sheetMaxHeight,
          }}
        >
          {/* Handle */}
          <View style={{ alignItems: 'center', paddingTop: spacing[3] }}>
            <View style={{ width: 36, height: 4, borderRadius: radius.full, backgroundColor: colors.border }} />
          </View>

          {/* Header */}
          {title && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing[5], paddingTop: spacing[4], paddingBottom: spacing[3] }}>
              <Text style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.textPrimary }}>{title}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={{ fontSize: fontSize.base, color: colors.textMuted }}>İptal</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Content */}
          {scrollable ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: spacing[5], paddingBottom: spacing[6] + insets.bottom }}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={{ paddingHorizontal: spacing[5], paddingBottom: spacing[5] + insets.bottom }}>
              {children}
            </View>
          )}
        </View>
      </View>
    </Modal>
  )
}
