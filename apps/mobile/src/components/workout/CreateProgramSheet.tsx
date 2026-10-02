import { View, Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { BottomSheet } from '../ui/BottomSheet'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { useTheme } from '../../contexts/ThemeContext'
import { useLang } from '../../contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '../../theme/tokens'

interface Props {
  visible: boolean
  onClose: () => void
  name: string
  onChangeName: (value: string) => void
  dayNames: string[]
  onChangeDayNames: (update: (days: string[]) => string[]) => void
  saving: boolean
  onSave: () => void
}

/** Kendi programını oluşturma penceresi: program adı ve haftalık gün adları (en çok 7). */
export function CreateProgramSheet({ visible, onClose, name, onChangeName, dayNames, onChangeDayNames, saving, onSave }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t.wk_create_own}
      scrollable
    >
      <View style={{ gap: spacing[3] }}>
        <Input label={t.wk_program_name} value={name} onChangeText={onChangeName} placeholder={t.wk_program_name_ph} />

        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary }}>
          {t.wk_weekly_days.replace('{n}', String(dayNames.length))}
        </Text>
        <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
          {t.wk_create_hint}
        </Text>

        {dayNames.map((dayName, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <Input
              value={dayName}
              onChangeText={(value) => onChangeDayNames((days) => days.map((d, index) => index === i ? value : d))}
              placeholder={t.wk_day_n.replace('{n}', String(i + 1))}
              containerStyle={{ flex: 1 }}
            />
            {dayNames.length > 1 && (
              <TouchableOpacity onPress={() => onChangeDayNames((days) => days.filter((_, index) => index !== i))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={20} color={colors.textSubtle} />
              </TouchableOpacity>
            )}
          </View>
        ))}

        {dayNames.length < 7 && (
          <TouchableOpacity
            onPress={() => onChangeDayNames((days) => [...days, t.wk_day_n.replace('{n}', String(days.length + 1))])}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[1], paddingVertical: spacing[2], borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong }}
          >
            <Ionicons name="add" size={16} color={palette.accent} />
            <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: palette.accent }}>{t.wk_add_day}</Text>
          </TouchableOpacity>
        )}

        <Button
          label={saving ? t.wk_creating : t.wk_create_program}
          onPress={onSave}
          loading={saving}
          fullWidth
        />
      </View>
    </BottomSheet>
  )
}
