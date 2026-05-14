import { Modal, View, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native'
import { BlurView } from 'expo-blur'
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
  const { colors, isDark } = useTheme()

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.50)', justifyContent: 'flex-end' }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View
              style={{
                backgroundColor: colors.bgElevated,
                borderTopLeftRadius: radius['2xl'],
                borderTopRightRadius: radius['2xl'],
                borderTopWidth: 1,
                borderLeftWidth: 1,
                borderRightWidth: 1,
                borderColor: colors.glassBorder,
                overflow: 'hidden',
                maxHeight: '90%',
              }}
            >
              {/* Handle */}
              <View style={{ alignItems: 'center', paddingTop: spacing[3] }}>
                <View
                  style={{
                    width: 36,
                    height: 4,
                    borderRadius: radius.full,
                    backgroundColor: colors.border,
                  }}
                />
              </View>

              {/* Header */}
              {title && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: spacing[5],
                    paddingTop: spacing[4],
                    paddingBottom: spacing[3],
                  }}
                >
                  <Text style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.textPrimary }}>
                    {title}
                  </Text>
                  <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Text style={{ fontSize: fontSize.base, color: colors.textMuted }}>İptal</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Content */}
              {scrollable ? (
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingHorizontal: spacing[5], paddingBottom: spacing[8] }}
                >
                  {children}
                </ScrollView>
              ) : (
                <View style={{ paddingHorizontal: spacing[5], paddingBottom: spacing[8] }}>
                  {children}
                </View>
              )}
            </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  )
}
