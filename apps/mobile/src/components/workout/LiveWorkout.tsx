import { useEffect, useRef, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { currentGroupIndex, groupSetsByExercise, parseSetEntry, suggestedWeight, useWorkoutStore } from '@lifeos/shared'
import type { Exercise, ExerciseSetGroup, Workout, WorkoutSet } from '@lifeos/shared'
import { ExerciseImage } from './ExerciseImage'
import { ProgressionHint } from './ProgressionHint'
import { useTheme } from '../../contexts/ThemeContext'
import { useLang } from '../../contexts/LangContext'
import { supabase } from '../../lib/supabase'
import { palette, fontSize, fontWeight, spacing, radius } from '../../theme/tokens'

interface Props {
  workout: Workout
  userId: string
  /** Harekete fazladan set: ekrandaki set ekleme penceresini açar. */
  onAddSet: (exercise: Exercise) => void
  /** Şimdiki hareketin ana kası; kas haritası onu vurgular. */
  onFocusMuscle: (muscleGroupId: number | null) => void
}

interface Draft { weight: string; reps: string }

/**
 * Süren antrenmanın ekranı: şimdiki hareketin setleri (ağırlık, tekrar,
 * tamamlandı), altında sıradaki ve biten hareketler. Sıradaki ya da biten bir
 * harekete dokunmak onu "şimdi" kartına alır; sıra zorunlu değil.
 */
export function LiveWorkout({ workout, userId, onAddSet, onFocusMuscle }: Props) {
  const { colors } = useTheme()
  const { t, lang } = useLang()
  const { updateSet, removeSet } = useWorkoutStore()
  /** Kullanıcının seçtiği hareket; null iken sıradaki tamamlanmamış hareket. */
  const [focusId, setFocusId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  /** Aynı karede gelen ikinci dokunuş, state güncellenmeden geçmesin. */
  const busy = useRef(false)

  const sets = workout.workout_sets ?? []
  const groups = groupSetsByExercise(sets)
  const autoIndex = currentGroupIndex(groups)
  const pickedIndex = focusId ? groups.findIndex((g) => g.exerciseId === focusId) : -1
  const focusIndex = pickedIndex >= 0 ? pickedIndex : autoIndex
  const focused = focusIndex >= 0 ? groups[focusIndex]! : null
  const doneCount = sets.filter((s) => s.completed).length
  const focusMuscle = focused?.exercise?.muscle_group_id ?? null

  useEffect(() => { onFocusMuscle(focusMuscle) }, [focusMuscle, onFocusMuscle])

  const nameOf = (e: WorkoutSet['exercise']) => (e ? (lang === 'en' ? (e.name_en ?? e.name) : e.name) : t.wk_exercise)
  const summaryOf = (g: ExerciseSetGroup) =>
    `${g.sets.filter((s) => s.completed).length}/${g.sets.length} · ${g.sets.length}×${g.sets[0]?.reps ?? '-'}`

  function draftOf(group: ExerciseSetGroup, set: WorkoutSet): Draft {
    return drafts[set.id] ?? {
      weight: String(suggestedWeight(group, set.id) ?? ''),
      reps: set.reps === null ? '' : String(set.reps),
    }
  }

  function editDraft(group: ExerciseSetGroup, set: WorkoutSet, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [set.id]: { ...draftOf(group, set), ...patch } }))
  }

  async function toggleSet(group: ExerciseSetGroup, set: WorkoutSet) {
    if (busy.current) return
    const draft = draftOf(group, set)
    const completed = !set.completed
    const entry = completed ? parseSetEntry(draft.weight, draft.reps) : {}
    if (!entry) {
      Alert.alert(t.error, t.wk_err_invalid_set)
      return
    }
    busy.current = true
    setSavingId(set.id)
    try {
      await updateSet(supabase, set.id, { completed, ...entry })
      setDrafts(({ [set.id]: _saved, ...rest }) => rest)
      // Hareketin son seti de bittiyse seçim bırakılır, kart sıradakine geçer.
      if (completed && group.sets.every((s) => s.id === set.id || s.completed)) setFocusId(null)
    } catch {
      Alert.alert(t.error, t.wk_err_save_set)
    } finally {
      busy.current = false
      setSavingId(null)
    }
  }

  async function deleteSet(set: WorkoutSet) {
    if (busy.current) return
    busy.current = true
    try {
      await removeSet(supabase, set.id)
    } catch {
      Alert.alert(t.error, t.wk_err_remove_set)
    } finally {
      busy.current = false
    }
  }

  function applyHint(group: ExerciseSetGroup, reps: number, weightKg: number | null) {
    setDrafts((d) => {
      const next = { ...d }
      for (const s of group.sets) {
        if (!s.completed) next[s.id] = { reps: String(reps), weight: weightKg === null ? draftOf(group, s).weight : String(weightKg) }
      }
      return next
    })
  }

  const inputStyle = {
    flex: 1, paddingVertical: 8, paddingHorizontal: spacing[2], borderRadius: radius.md, textAlign: 'center' as const,
    fontSize: fontSize.base, color: colors.inputText, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.inputBorder,
  }
  const upcoming = groups.filter((g, i) => i !== focusIndex && g.sets.some((s) => !s.completed))
  const finished = groups.filter((g, i) => i !== focusIndex && g.sets.every((s) => s.completed))

  function groupRow(group: ExerciseSetGroup, dim: boolean) {
    return (
      <TouchableOpacity
        key={group.exerciseId}
        onPress={() => setFocusId(group.exerciseId)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2], borderBottomWidth: 1, borderBottomColor: colors.border, opacity: dim ? 0.55 : 1 }}
      >
        <Ionicons name={dim ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={dim ? palette.success : colors.textSubtle} />
        <Text style={{ flex: 1, fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }} numberOfLines={1}>{nameOf(group.exercise)}</Text>
        <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, fontVariant: ['tabular-nums'] }}>{summaryOf(group)}</Text>
      </TouchableOpacity>
    )
  }

  return (
    <View style={{ marginBottom: spacing[4] }}>
      <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginBottom: 6 }}>
        {t.wk_live_progress.replace('{done}', String(doneCount)).replace('{total}', String(sets.length))}
      </Text>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.glassInner, overflow: 'hidden', marginBottom: spacing[4] }}>
        <View style={{ width: `${sets.length ? (doneCount / sets.length) * 100 : 0}%`, height: '100%', backgroundColor: palette.success }} />
      </View>

      {focused ? (
        <View style={{ padding: spacing[3], borderRadius: radius.lg, borderWidth: 1, borderColor: `${palette.workout}40`, backgroundColor: `${palette.workout}0D`, gap: spacing[2], marginBottom: spacing[4] }}>
          <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: palette.workout, letterSpacing: 0.5 }}>{t.wk_live_now.toLocaleUpperCase(lang)}</Text>
          <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary }}>{nameOf(focused.exercise)}</Text>
          <ExerciseImage uri={focused.exercise?.image_url} startUri={focused.exercise?.image_start_url} style={{ width: '100%', height: 160, borderRadius: radius.md }} />

          <View style={{ flexDirection: 'row', gap: spacing[2], paddingRight: 62 }}>
            <Text style={{ width: 26, fontSize: fontSize.xs, color: colors.textSubtle, textAlign: 'center' }}>Set</Text>
            <Text style={{ flex: 1, fontSize: fontSize.xs, color: colors.textSubtle, textAlign: 'center' }}>kg</Text>
            <Text style={{ flex: 1, fontSize: fontSize.xs, color: colors.textSubtle, textAlign: 'center' }}>{t.wk_live_reps}</Text>
          </View>
          {focused.sets.map((set) => {
            const draft = draftOf(focused, set)
            return (
              <View key={set.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], opacity: set.completed ? 0.6 : 1 }}>
                <Text style={{ width: 26, textAlign: 'center', fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: palette.workout }}>{set.set_number}</Text>
                <TextInput
                  value={set.completed ? String(set.weight_kg ?? '') : draft.weight}
                  onChangeText={(weight) => editDraft(focused, set, { weight })}
                  editable={!set.completed}
                  keyboardType="decimal-pad"
                  placeholder="-"
                  placeholderTextColor={colors.inputPlaceholder}
                  style={inputStyle}
                />
                <TextInput
                  value={set.completed ? String(set.reps ?? '') : draft.reps}
                  onChangeText={(reps) => editDraft(focused, set, { reps })}
                  editable={!set.completed}
                  keyboardType="number-pad"
                  placeholder="-"
                  placeholderTextColor={colors.inputPlaceholder}
                  style={inputStyle}
                />
                <TouchableOpacity onPress={() => void toggleSet(focused, set)} disabled={savingId !== null} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Ionicons name={set.completed ? 'checkmark-circle' : 'checkmark-circle-outline'} size={32} color={set.completed ? palette.success : colors.textSubtle} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => void deleteSet(set)} hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}>
                  <Ionicons name="close-circle-outline" size={18} color={colors.textSubtle} />
                </TouchableOpacity>
              </View>
            )
          })}

          {focused.exercise && (
            <TouchableOpacity onPress={() => onAddSet(focused.exercise!)} style={{ alignSelf: 'flex-start', paddingVertical: spacing[1] }}>
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.workout }}>+ Set</Text>
            </TouchableOpacity>
          )}
          {focused.exercise && (
            <ProgressionHint exercise={focused.exercise} userId={userId} excludeWorkoutId={workout.id} onApply={(reps, kg) => applyHint(focused, reps, kg)} />
          )}
        </View>
      ) : (
        <Text style={{ fontSize: fontSize.sm, color: palette.success, textAlign: 'center', paddingVertical: spacing[3] }}>{t.wk_live_all_done}</Text>
      )}

      {upcoming.length > 0 && (
        <>
          <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textMuted, marginBottom: spacing[1] }}>{t.wk_live_next}</Text>
          {upcoming.map((g) => groupRow(g, false))}
        </>
      )}
      {finished.length > 0 && (
        <>
          <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textMuted, marginTop: spacing[3], marginBottom: spacing[1] }}>{t.wk_live_done}</Text>
          {finished.map((g) => groupRow(g, true))}
        </>
      )}
    </View>
  )
}
