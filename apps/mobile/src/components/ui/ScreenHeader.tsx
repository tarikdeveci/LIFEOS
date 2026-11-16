import type { ComponentProps, ReactNode } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme } from '../../contexts/ThemeContext'
import { BackButton } from './BackButton'
import { fontSize, fontWeight, spacing, MIN_TOUCH } from '../../theme/tokens'

interface ScreenHeaderProps {
  title: string
  /** Başlığın üstünde küçük üst satır (ör. "Bugün" ve altında tarih). */
  eyebrow?: string
  /** Ana sekme dışındaki ekranlarda sol üstte geri düğmesi (UX.md 1). */
  back?: boolean
  /** Geri dönmeden önce iş yapan ekranlar için `BackButton onPress`. */
  onBack?: () => void
  /** Başlığın solunda duran öğe (geri yoksa). */
  left?: ReactNode
  /** Sağdaki eylemler: `HeaderIconButton` veya birincil eylem. */
  right?: ReactNode
  /** Başlık satırının altında sabit kalan içerik (ör. `Segmented`). */
  children?: ReactNode
}

/**
 * Ekranın sabit üst bandı. Kaydırılan içeriğin dışında, `ScrollView`'un kardeşi olarak
 * çizilir: içerik kayarken başlık ve eylemler yerinde durur (kullanıcı isteği 2026-11-16).
 */
export function ScreenHeader({ title, eyebrow, back, onBack, left, right, children }: ScreenHeaderProps) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        paddingHorizontal: spacing[5],
        paddingTop: spacing[2],
        paddingBottom: spacing[3],
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
        gap: spacing[3],
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], minHeight: MIN_TOUCH }}>
        {back ? <BackButton onPress={onBack} /> : left}
        <View style={{ flex: 1, paddingLeft: left && !back ? spacing[1] : 0 }}>
          {eyebrow ? (
            <Text
              style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}
              numberOfLines={1}
            >
              {eyebrow}
            </Text>
          ) : null}
          <Text
            accessibilityRole="header"
            style={{ fontSize: eyebrow ? fontSize.xl : fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.textPrimary }}
            numberOfLines={2}
          >
            {title}
          </Text>
        </View>
        {right ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>{right}</View> : null}
      </View>
      {children}
    </View>
  )
}

interface HeaderIconButtonProps {
  icon: ComponentProps<typeof Ionicons>['name']
  label: string
  onPress: () => void
  color?: string
}

/** Başlıktaki yalnız ikonlu düğme: 44x44, etiket ekran okuyucuya gider (DESIGN.md 3). */
export function HeaderIconButton({ icon, label, onPress, color }: HeaderIconButtonProps) {
  const { colors } = useTheme()
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: MIN_TOUCH,
        height: MIN_TOUCH,
        borderRadius: MIN_TOUCH / 2,
        backgroundColor: colors.glassInner,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={icon} size={20} color={color ?? colors.textSecondary} />
    </TouchableOpacity>
  )
}
