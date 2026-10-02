import { View, Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { isExerciseAvailable } from '@lifeos/shared'
import type { EquipmentKey, ProgramEquipmentFit, WorkoutProgram } from '@lifeos/shared'
import { useTheme } from '../../contexts/ThemeContext'
import { useLang } from '../../contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '../../theme/tokens'
import { exerciseName } from './labels'
import { activeDays, programDayLabel } from './programDays'

interface Props {
  /** Detay sayfasında açık olan programın güncel kaydı. */
  program: WorkoutProgram | null
  equipment: EquipmentKey[] | null
  fit: ProgramEquipmentFit | null
  canAdapt: boolean
  /** Şablon değil, kullanıcının kendi programı: hareket eklenir, silinir. */
  isOwnProgram: boolean
  expandedDay: string | null
  onExpandDay: (dayId: string | null) => void
  /** Bugün bitmemiş bir antrenman var: setler onun üstüne eklenir. */
  hasOpenWorkout: boolean
  starting: boolean
  onAdapt: () => void
  onPlan: () => void
  onAddMovement: (dayId: string) => void
  onRemoveExercise: (rowId: string) => void
  onStartDay: (program: WorkoutProgram, dayId: string) => void
  onDelete: (program: WorkoutProgram) => void
}

/** Program detayının ana görünümü: uyarla ve takvime ekle düğmeleri, açılır gün listesi. */
export function ProgramDaysView({
  program, equipment, fit, canAdapt, isOwnProgram, expandedDay, onExpandDay, hasOpenWorkout, starting,
  onAdapt, onPlan, onAddMovement, onRemoveExercise, onStartDay, onDelete,
}: Props) {
  const { colors } = useTheme()
  const { t, lang } = useLang()

  return (
    <View style={{ gap: spacing[2] }}>
      {/* Yalnızca gerçekten uyarlanacak bir şey varken: tamamı uygun
          programda düğme göstermek "bir şey eksik mi" diye düşündürür. */}
      {canAdapt && fit && (
        <TouchableOpacity
          onPress={onAdapt}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], paddingVertical: spacing[3], borderRadius: radius.lg, backgroundColor: `${palette.warning}15`, borderWidth: 1, borderColor: `${palette.warning}40` }}
        >
          <Ionicons name="construct-outline" size={16} color={palette.warning} />
          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.warning }}>
            {t.wk_adapt_btn.replace('{n}', String(fit.total - fit.available))}
          </Text>
        </TouchableOpacity>
      )}

      {activeDays(program).length > 0 && (
        <TouchableOpacity
          onPress={onPlan}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], paddingVertical: spacing[3], borderRadius: radius.lg, backgroundColor: `${palette.workout}18`, borderWidth: 1, borderColor: `${palette.workout}40`, marginBottom: spacing[1] }}
        >
          <Ionicons name="calendar-outline" size={16} color={palette.workout} />
          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.workout }}>
            {t.wk_add_to_calendar}
          </Text>
        </TouchableOpacity>
      )}

      {hasOpenWorkout && (
        <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginBottom: spacing[1] }}>
          {t.wk_open_workout_note}
        </Text>
      )}
      {(program?.days ?? []).filter((d) => !d.is_rest).map((day) => {
        const exercises = [...(day.exercises ?? [])].sort((a, b) => a.order_index - b.order_index)
        const exCount = exercises.length
        const setCount = exercises.reduce((sum, ex) => sum + Math.min(12, Math.max(1, ex.sets ?? 3)), 0)
        const isOpen = expandedDay === day.id
        return (
          <View
            key={day.id}
            style={{ borderRadius: radius.lg, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: isOpen ? palette.accent : colors.border, overflow: 'hidden' }}
          >
            {/* Başlığa dokunmak günü AÇAR, başlatmaz. Eskiden dokunmak
                antrenmanı anında başlatıyordu; programın içinde ne olduğunu
                görmenin hiçbir yolu yoktu. */}
            <TouchableOpacity
              onPress={() => onExpandDay(isOpen ? null : day.id)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing[3], paddingHorizontal: spacing[3] }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{programDayLabel(day, t)}</Text>
                <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>
                  {exCount === 0 ? t.wk_no_exercises_defined : t.wk_ex_sets.replace('{e}', String(exCount)).replace('{s}', String(setCount))}
                </Text>
              </View>
              <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
            </TouchableOpacity>

            {isOpen && (
              <View style={{ paddingHorizontal: spacing[3], paddingBottom: spacing[3], gap: spacing[2] }}>
                <View style={{ height: 1, backgroundColor: colors.border }} />
                {exercises.map((ex, i) => (
                  <View key={ex.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                    <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, width: 18 }}>{i + 1}.</Text>
                    <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.textSecondary }} numberOfLines={1}>
                      {exerciseName(ex.exercise, lang, t)}
                    </Text>
                    {ex.exercise && !isExerciseAvailable(ex.exercise, equipment) && (
                      <Ionicons name="alert-circle-outline" size={14} color={palette.warning} />
                    )}
                    <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
                      {ex.sets}×{ex.reps ?? '-'} · {ex.rest_seconds}{t.coach_rest_sec}
                    </Text>
                    {isOwnProgram && (
                      <TouchableOpacity onPress={() => onRemoveExercise(ex.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close-circle" size={17} color={colors.textSubtle} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}

                {exCount === 0 && (
                  <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>
                    {isOwnProgram ? t.wk_own_day_empty : t.wk_day_empty}
                  </Text>
                )}

                {/* Global template'ler düzenlenemez (RLS zaten engeller); düğme
                    yalnızca kullanıcının kendi programında görünür. */}
                {isOwnProgram && (
                  <TouchableOpacity
                    onPress={() => onAddMovement(day.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[1], paddingVertical: spacing[2], borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong }}
                  >
                    <Ionicons name="add" size={16} color={palette.accent} />
                    <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: palette.accent }}>{t.wk_add_movement}</Text>
                  </TouchableOpacity>
                )}

                {exCount > 0 && (
                  <TouchableOpacity
                    disabled={starting}
                    onPress={() => onStartDay(program as WorkoutProgram, day.id)}
                    style={{ marginTop: spacing[1], paddingVertical: spacing[3], borderRadius: radius.lg, alignItems: 'center', backgroundColor: palette.accent, opacity: starting ? 0.5 : 1 }}
                  >
                    <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: '#fff' }}>
                      {starting ? t.wk_starting : t.wk_start_with_day}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )
      })}

      {isOwnProgram && program && (
        <TouchableOpacity onPress={() => onDelete(program)} style={{ paddingVertical: spacing[3], alignItems: 'center' }}>
          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.danger }}>{t.wk_delete_program}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}
