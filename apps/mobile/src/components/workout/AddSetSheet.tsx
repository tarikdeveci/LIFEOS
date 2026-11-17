import { useEffect, useRef, useState } from 'react'
import { View, Text } from 'react-native'
import { lastSetOf, nextSetNumbers, parseSetEntry, useWorkoutStore } from '@lifeos/shared'
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
  const addSets = useWorkoutStore((s) => s.addSets)
  const [reps, setReps] = useState('10')
  const [weight, setWeight] = useState('')
  const [adding, setAdding] = useState(false)
  /** "Uygula" ile gelen hedef set sayısı; null iken tek set eklenir. */
  const [applySets, setApplySets] = useState<number | null>(null)
  /** Hata formun içinde görünür, girilen değerler kaybolmaz. */
  const [error, setError] = useState<string | null>(null)
  // State bir sonraki çizime kadar güncellenmez; aynı karedeki ikinci dokunuş çift set yazmasın.
  const busy = useRef(false)

  // Hareket açılınca form, bu antrenmandaki son setin değerleriyle dolar; set yoksa boş.
  useEffect(() => {
    const last = exercise ? lastSetOf(workout.workout_sets ?? [], exercise.id) : null
    setReps(last?.reps != null ? String(last.reps) : '10')
    setWeight(last?.weight_kg != null ? String(last.weight_kg) : '')
    setApplySets(null)
    setError(null)
    // Yalnızca hareket değişince: set eklendikçe kullanıcının yazdığı ezilmesin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise?.id])

  async function handleAdd() {
    if (!exercise || busy.current) return
    // "62,5" gibi virgüllü ağırlık da geçerli; boş tekrar 10 sayılır, 0 tekrar set değildir.
    const entry = parseSetEntry(weight, reps)
    if (!entry || entry.reps === 0) {
      setError(t.wk_err_invalid_set)
      return
    }
    busy.current = true
    setAdding(true)
    setError(null)
    try {
      // set_number: bu hareketin en büyük numarasının devamı (silinen set çakışma yaratmaz).
      const numbers = nextSetNumbers(workout.workout_sets ?? [], exercise.id, applySets ?? 1)
      await addSets(supabase, workout.id, numbers.map((set_number) => ({
        workout_id: workout.id,
        exercise_id: exercise.id,
        reps: entry.reps ?? 10,
        weight_kg: entry.weight_kg,
        set_number,
      })))
      onClose()
    } catch { setError(t.wk_err_add_set) }
    finally { busy.current = false; setAdding(false) }
  }

  return (
    <BottomSheet visible={!!exercise} onClose={onClose} title={t.wk_add_set}>
      <View style={{ gap: spacing[4] }}>
        {exercise && (
          <View style={{ padding: spacing[3], borderRadius: radius.lg, backgroundColor: `${palette.workout}10`, borderWidth: 1, borderColor: `${palette.workout}25` }}>
            <ExerciseImage uri={exercise.image_url} startUri={exercise.image_start_url} style={{ width: '100%', height: 160, borderRadius: radius.md, marginBottom: spacing[2] }} />
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
            onApply={(sets, r, weightKg) => {
              setReps(String(r))
              setWeight(weightKg !== null ? String(weightKg) : '')
              setApplySets(sets)
              setError(null)
            }}
          />
        )}
        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <Input label={t.wk_reps} value={reps} onChangeText={setReps} keyboardType="number-pad" placeholder="10" containerStyle={{ flex: 1 }} />
          {!exercise?.is_bodyweight && (
            <Input label={t.wk_weight_kg} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="60" containerStyle={{ flex: 1 }} />
          )}
        </View>
        {error && <Text accessibilityRole="alert" style={{ fontSize: fontSize.sm, color: palette.danger }}>{error}</Text>}
        <Button label={adding ? t.wk_adding : applySets !== null ? t.wkf_add_n_sets.replace('{n}', String(applySets)) : t.wk_add_set} onPress={handleAdd} loading={adding} fullWidth />
      </View>
    </BottomSheet>
  )
}
