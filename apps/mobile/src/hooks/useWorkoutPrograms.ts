import { useState } from 'react'
import { Alert } from 'react-native'
import { programEquipmentFit, useWorkoutStore } from '@lifeos/shared'
import type { ProgramAdaptation, ProgramEquipmentFit, WorkoutProgram } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { useLang } from '@/src/contexts/LangContext'

/**
 * Programlar sekmesinin durumu: seçili programın detay sayfası, kendi programını
 * oluşturma, güne hareket ekleme ve programı ekipmana uyarlama.
 */
export function useWorkoutPrograms(userId: string | null) {
  const { t } = useLang()
  const { programs, equipment, applyProgramAdaptation, createProgramWithDays, addExerciseToDay, removeExerciseFromDay, deleteProgram } = useWorkoutStore()
  const defaultDayNames = () => [1, 2, 3].map((n) => t.wk_day_n.replace('{n}', String(n)))

  const [selectedProgram, setSelectedProgram] = useState<WorkoutProgram | null>(null)
  /** Program günü açık mı: hangi hareketlerin olduğunu başlatmadan görebilmek için */
  const [expandedDay, setExpandedDay] = useState<string | null>(null)

  // Kendi program oluşturma
  const [showCreateProgram, setShowCreateProgram] = useState(false)
  const [newProgramName, setNewProgramName] = useState('')
  const [newDayNames, setNewDayNames] = useState<string[]>(defaultDayNames)
  const [savingProgram, setSavingProgram] = useState(false)
  /** Hangi güne hareket ekleniyor: egzersiz seçicisini açar */
  const [addingToDay, setAddingToDay] = useState<string | null>(null)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerSets, setPickerSets] = useState('3')
  const [pickerReps, setPickerReps] = useState('10')

  // Programı ekipmana uyarlama
  const [adaptingProgram, setAdaptingProgram] = useState(false)
  const [applyingAdaptation, setApplyingAdaptation] = useState(false)

  /**
   * selectedProgram bir anlık kopya; hareket eklendikten sonra store tazelenir
   * ama kopya bayat kalır. Detay sayfası her zaman listedeki güncel kaydı okur.
   */
  const liveProgram = selectedProgram
    ? (programs.find((p) => p.id === selectedProgram.id) ?? selectedProgram)
    : null
  const isOwnProgram = liveProgram !== null && liveProgram.user_id !== null

  function openCreateProgram() {
    setNewProgramName(''); setNewDayNames(defaultDayNames()); setShowCreateProgram(true)
  }

  function openExercisePicker(dayId: string) {
    setAddingToDay(dayId); setPickerSearch(''); setPickerSets('3'); setPickerReps('10')
  }

  function closeExercisePicker() {
    setAddingToDay(null); setPickerSearch('')
  }

  async function handleCreateProgram() {
    if (!userId || savingProgram) return
    const name = newProgramName.trim()
    const days = newDayNames.map((d) => d.trim()).filter(Boolean)
    if (!name || days.length === 0) {
      Alert.alert(t.wk_missing_info_title, t.wk_missing_info_msg)
      return
    }
    setSavingProgram(true)
    try {
      await createProgramWithDays(supabase, userId, { name, split_type: 'custom', frequency_per_week: days.length }, days)
      setShowCreateProgram(false)
      Alert.alert(t.wk_program_created_title, t.wk_program_created_msg)
    } catch {
      Alert.alert(t.error, t.wk_err_create_program)
    } finally {
      setSavingProgram(false)
    }
  }

  async function handleAddExerciseToDay(exerciseId: string) {
    if (!userId || !addingToDay) return
    const day = liveProgram?.days?.find((d) => d.id === addingToDay)
    const sets = Math.min(10, Math.max(1, parseInt(pickerSets, 10) || 3))
    const reps = pickerReps.trim() ? Math.min(100, Math.max(1, parseInt(pickerReps, 10) || 10)) : null
    try {
      await addExerciseToDay(supabase, userId, addingToDay, {
        exercise_id: exerciseId,
        sets,
        reps,
        rest_seconds: 90,
        order_index: (day?.exercises?.length ?? 0) + 1,
      })
      setAddingToDay(null)
      setPickerSearch('')
    } catch (err) {
      // Sebebi yutmak hatayi gorunmez kiliyordu; RLS/kolon hatasi da olsa yaz.
      Alert.alert(t.error, err instanceof Error ? err.message : t.wk_err_add_exercise)
    }
  }

  async function handleRemoveProgramExercise(rowId: string) {
    if (!userId) return
    try {
      await removeExerciseFromDay(supabase, userId, rowId)
    } catch {
      Alert.alert(t.error, t.wk_err_remove_exercise)
    }
  }

  /**
   * Uyarlama planını yazar. Şablonda kopya açılır ve detay sayfası kopyaya
   * geçer; kendi programında satırlar yerinde değişir ve sayfa aynı kalır.
   */
  async function handleApplyAdaptation(adaptation: ProgramAdaptation) {
    if (!userId || !liveProgram || applyingAdaptation) return
    setApplyingAdaptation(true)
    try {
      const result = await applyProgramAdaptation(supabase, userId, liveProgram, adaptation)
      setAdaptingProgram(false)
      setExpandedDay(null)
      setSelectedProgram(result)
      Alert.alert(
        liveProgram.user_id === null ? t.wk_copy_created : t.wk_program_updated,
        t.wk_adapt_result.replace('{r}', String(adaptation.replaced)).replace('{d}', String(adaptation.dropped)),
      )
    } catch (err) {
      Alert.alert(t.error, err instanceof Error ? err.message : t.wk_err_adapt)
    } finally {
      setApplyingAdaptation(false)
    }
  }

  function handleDeleteProgram(program: WorkoutProgram) {
    Alert.alert(t.wk_del_program_title, t.wk_del_program_msg.replace('{name}', program.name), [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.wk_delete,
        style: 'destructive',
        onPress: () => void (async () => {
          try {
            await deleteProgram(supabase, program.id)
            setSelectedProgram(null)
            setExpandedDay(null)
          } catch {
            Alert.alert(t.error, t.wk_err_del_program)
          }
        })(),
      },
    ])
  }

  // Seçim varken uygun programlar üste: kullanıcı önce yapabileceğini görsün.
  const fitByProgram = new Map<string, ProgramEquipmentFit | null>(
    programs.map((p) => [p.id, equipment === null ? null : programEquipmentFit(p, equipment)]),
  )
  const sortedPrograms = equipment === null
    ? programs
    : [...programs].sort((a, b) => {
        const fa = fitByProgram.get(a.id); const fb = fitByProgram.get(b.id)
        const ua = fa ? fa.total - fa.available : 0
        const ub = fb ? fb.total - fb.available : 0
        return ua - ub
      })
  const liveFit = liveProgram && equipment !== null ? programEquipmentFit(liveProgram, equipment) : null
  const canAdapt = liveFit !== null && liveFit.available < liveFit.total

  return {
    selectedProgram, setSelectedProgram, liveProgram, isOwnProgram, expandedDay, setExpandedDay,
    showCreateProgram, setShowCreateProgram, newProgramName, setNewProgramName, newDayNames, setNewDayNames, savingProgram,
    addingToDay, setAddingToDay, pickerSearch, setPickerSearch, pickerSets, setPickerSets, pickerReps, setPickerReps,
    adaptingProgram, setAdaptingProgram, applyingAdaptation,
    fitByProgram, sortedPrograms, liveFit, canAdapt,
    openCreateProgram, openExercisePicker, closeExercisePicker,
    handleCreateProgram, handleAddExerciseToDay, handleRemoveProgramExercise, handleApplyAdaptation, handleDeleteProgram,
  }
}
