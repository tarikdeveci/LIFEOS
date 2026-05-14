import { Modal, View, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native'
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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* Tap-to-close backdrop */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.50)' }}
        />

        {/* Sheet — KeyboardAvoidingView wraps ONLY the sheet, not the backdrop */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View
            style={{
              backgroundColor: colors.bgElevated,
              borderTopLeftRadius: radius['2xl'],
              borderTopRightRadius: radius['2xl'],
              borderTopWidth: 1,
              borderLeftWidth: 1,
              borderRightWidth: 1,
              borderColor: colors.glassBorder,
              maxHeight: '90%',
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
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: spacing[5], paddingBottom: spacing[10] }}
              >
                {children}
              </ScrollView>
            ) : (
              <View style={{ paddingHorizontal: spacing[5], paddingBottom: spacing[8] }}>
                {children}
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}
