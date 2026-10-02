import { View, Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import type { EquipmentKey, Exercise } from '@lifeos/shared'
import { Input } from '../ui/Input'
import { useTheme } from '../../contexts/ThemeContext'
import { useLang } from '../../contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '../../theme/tokens'
import { exerciseName, missingLabel, muscleGroupName } from './labels'

interface Props {
  /** Arama ve ekipman süzgecinden geçen hareketler. */
  exercises: Exercise[]
  equipment: EquipmentKey[] | null
  sets: string
  onChangeSets: (value: string) => void
  reps: string
  onChangeReps: (value: string) => void
  search: string
  onChangeSearch: (value: string) => void
  onlyAvailable: boolean
  onToggleOnlyAvailable: () => void
  onBack: () => void
  onPick: (exerciseId: string) => void
}

/** Program gününe hareket ekleme: program detayında gün listesinin yerini alan seçici. */
export function ProgramExercisePickerView({
  exercises, equipment, sets, onChangeSets, reps, onChangeReps, search, onChangeSearch,
  onlyAvailable, onToggleOnlyAvailable, onBack, onPick,
}: Props) {
  const { colors } = useTheme()
  const { t, lang } = useLang()

  return (
    <View style={{ gap: spacing[3] }}>
      <TouchableOpacity
        onPress={onBack}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}
      >
        <Ionicons name="chevron-back" size={16} color={palette.accent} />
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.accent }}>{t.wk_back_to_program}</Text>
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        <Input label={t.wk_sets} value={sets} onChangeText={onChangeSets} keyboardType="number-pad" containerStyle={{ flex: 1 }} />
        <Input label={t.wk_reps} value={reps} onChangeText={onChangeReps} keyboardType="number-pad" containerStyle={{ flex: 1 }} />
      </View>
      <Input label={t.wk_search_exercise} value={search} onChangeText={onChangeSearch} placeholder="hip thrust, squat..." />
      {equipment !== null && (
        <TouchableOpacity onPress={onToggleOnlyAvailable} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Ionicons name={onlyAvailable ? 'checkbox' : 'square-outline'} size={18} color={onlyAvailable ? palette.workout : colors.textSubtle} />
          <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>{t.wk_only_mine}</Text>
        </TouchableOpacity>
      )}
      {exercises.map((e) => {
        const missing = missingLabel(e, equipment, lang, t)
        return (
          <TouchableOpacity
            key={e.id}
            onPress={() => onPick(e.id)}
            style={{ paddingVertical: spacing[3], paddingHorizontal: spacing[3], borderRadius: radius.lg, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border }}
          >
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{exerciseName(e, lang, t)}</Text>
            {e.muscle_group && (
              <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>{muscleGroupName(e.muscle_group, lang)}</Text>
            )}
            {missing && (
              <Text style={{ fontSize: fontSize.xs, color: palette.warning, marginTop: 2 }}>{missing}</Text>
            )}
          </TouchableOpacity>
        )
      })}
      {exercises.length === 0 && (
        <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle, textAlign: 'center', paddingVertical: spacing[2] }}>{t.work_no_results}</Text>
      )}
    </View>
  )
}
