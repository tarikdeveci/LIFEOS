import { View, Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { useTheme } from '../../contexts/ThemeContext'
import { useLang } from '../../contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius, MIN_TOUCH } from '../../theme/tokens'
import type { ProgramEditor } from '../../hooks/useProgramEditor'
import { exerciseName } from './labels'

interface Props {
  editor: ProgramEditor
}

/** Program sayfasının iç görünümü: adları düzenle ya da tek hareketi düzenle. Kaydet tek yazma noktası, geri hiçbir şey yazmaz. */
export function ProgramEditView({ editor }: Props) {
  const { colors } = useTheme()
  const { t, lang } = useLang()

  if (editor.mode?.kind === 'names') {
    return (
      <View style={{ gap: spacing[4] }}>
        <Input label={t.ux_wk_program_name} value={editor.programName} onChangeText={editor.setProgramName} maxLength={60} />
        {editor.workDays.map((day) => (
          <Input
            key={day.id}
            label={t.ux_wk_day_name.replace('{n}', String(day.day_number))}
            value={editor.dayNames[day.id] ?? ''}
            onChangeText={(v) => editor.setDayNames((prev) => ({ ...prev, [day.id]: v }))}
            placeholder={t.wk_day_n.replace('{n}', String(day.day_number))}
            maxLength={40}
          />
        ))}
        {editor.error && <Text style={{ fontSize: fontSize.sm, color: palette.danger }}>{editor.error}</Text>}
        <Button label={t.ux_wk_save} onPress={() => void editor.saveNames()} loading={editor.saving} fullWidth />
      </View>
    )
  }

  if (editor.mode?.kind !== 'exercise' || !editor.editRow) return null
  const { position, total } = editor
  const stepButton = (icon: 'arrow-up' | 'arrow-down', label: string, disabled: boolean, next: number) => (
    <TouchableOpacity
      onPress={() => editor.setPosition(next)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={{ width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border, opacity: disabled ? 0.4 : 1 }}
    >
      <Ionicons name={icon} size={18} color={colors.textPrimary} />
    </TouchableOpacity>
  )

  return (
    <View style={{ gap: spacing[4] }}>
      <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
        {exerciseName(editor.editRow.exercise, lang, t)}
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing[3] }}>
        <Input containerStyle={{ flex: 1 }} label={t.ux_wk_sets} value={editor.sets} onChangeText={editor.setSets} keyboardType="number-pad" maxLength={2} />
        <Input containerStyle={{ flex: 1 }} label={t.ux_wk_rest} value={editor.rest} onChangeText={editor.setRest} keyboardType="number-pad" maxLength={3} />
      </View>
      <Input label={t.ux_wk_reps} value={editor.reps} onChangeText={editor.setReps} keyboardType="number-pad" maxLength={3} />
      {total > 1 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
          <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.textSecondary }}>
            {t.ux_wk_position.replace('{n}', String(position)).replace('{total}', String(total))}
          </Text>
          {stepButton('arrow-up', t.ux_wk_move_up, position <= 1, position - 1)}
          {stepButton('arrow-down', t.ux_wk_move_down, position >= total, position + 1)}
        </View>
      )}
      {editor.error && <Text style={{ fontSize: fontSize.sm, color: palette.danger }}>{editor.error}</Text>}
      <Button label={t.ux_wk_save} onPress={() => void editor.saveExercise()} loading={editor.saving} fullWidth />
    </View>
  )
}
