import { useEffect, useState } from 'react'
import { View, Text, Alert } from 'react-native'
import { useWorkoutStore } from '@lifeos/shared'
import type { Exercise, Workout } from '@lifeos/shared'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../contexts/ThemeContext'
import { useLang } from '../../contexts/LangContext'
import { BottomSheet } from '../ui/BottomSheet'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { palette, fontSize, fontWeight, spacing, radius } from '../../theme/tokens'
import { ExerciseImage } from './ExerciseImage'
import { ProgressionHint } from './ProgressionHint'
import { categoryLabel, exerciseName, muscleGroupName } from './labels'

interface Props {
  /** null iken pencere kapalı. */
  exercise: Exercise | null
  workout: Workout
  onClose: () => void
}

/** Süren antrenmana tek set ekleme penceresi: kütüphane satırı, canlı kart ve hareket detayı ortak kullanır. */
export function AddSetSheet({ exercise, workout, onClose }: Props) {
  const { colors } = useTheme()
  const { t, lang } = useLang()
  const addSet = useWorkoutStore((s) => s.addSet)
  const [reps, setReps] = useState('10')
  const [weight, setWeight] = useState('')
  const [adding, setAdding] = useState(false)

  // Her yeni hareket boş formla açılır.
  useEffect(() => { setReps('10'); setWeight('') }, [exercise?.id])

  async function handleAdd() {
    if (!exercise || adding) return
    setAdding(true)
    try {
      // set_number = bu egzersizin kaçıncı seti (toplam set sayısı değil)
      const doneForExercise = workout.workout_sets?.filter((s) => s.exercise_id === exercise.id).length ?? 0
      await addSet(supabase, {
        workout_id: workout.id,
        exercise_id: exercise.id,
        reps: parseInt(reps) || 10,
        weight_kg: weight ? parseFloat(weight) : undefined,
        set_number: doneForExercise + 1,
      })
      onClose()
    } catch { Alert.alert(t.error, t.wk_err_add_set) }
    finally { setAdding(false) }
  }

  return (
    <BottomSheet visible={!!exercise} onClose={onClose} title={t.wk_add_set}>
      <View style={{ gap: spacing[4] }}>
        {exercise && (
          <View style={{ padding: spacing[3], borderRadius: radius.lg, backgroundColor: `${palette.workout}10`, borderWidth: 1, borderColor: `${palette.workout}25` }}>
            <ExerciseImage uri={exercise.image_url} style={{ width: '100%', height: 160, borderRadius: radius.md, marginBottom: spacing[2] }} />
            <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{exerciseName(exercise, lang, t)}</Text>
            <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 }}>
              {muscleGroupName(exercise.muscle_group, lang)} · {categoryLabel(exercise.category, t)}
            </Text>
          </View>
        )}
        {exercise && (
          <ProgressionHint
            exercise={exercise}
            userId={workout.user_id}
            excludeWorkoutId={workout.id}
            onApply={(r, weightKg) => {
              setReps(String(r))
              setWeight(weightKg !== null ? String(weightKg) : '')
            }}
          />
        )}
        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <Input label={t.wk_reps} value={reps} onChangeText={setReps} keyboardType="number-pad" placeholder="10" containerStyle={{ flex: 1 }} />
          {!exercise?.is_bodyweight && (
            <Input label={t.wk_weight_kg} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="60" containerStyle={{ flex: 1 }} />
          )}
        </View>
        <Button label={adding ? t.wk_adding : t.wk_add_set} onPress={handleAdd} loading={adding} fullWidth />
      </View>
    </BottomSheet>
  )
}
