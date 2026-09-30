import { useEffect, useState, useCallback } from 'react'
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { supabase } from '@/src/lib/supabase'
import { aiErrorMessage, callAiSuggest } from '@/src/lib/ai'
import {
  WEEKDAY_ORDER, equipmentLabel, estimateWorkoutMinutes, isExerciseAvailable, localDateTime,
  missingEquipment, nextSlotTime, planProgram, programDaySetRows, programEquipmentFit, spreadWeekdays, todayDate, useWorkoutStore } from '@lifeos/shared'
import type { Exercise, WorkoutSet, WorkoutProgram, ProgramDay, AiProgramPlan, EquipmentKey, ProgramAdaptation, ProgramEquipmentFit } from '@lifeos/shared'
import { createTimeBlocks } from '@lifeos/shared/supabase'
import { createRecurringEvent, findWritableCalendarId, requestCalendarPermission } from '@/src/utils/calendarSync'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { StreakCard } from '@/src/components/workout/StreakCard'
import { EquipmentCard, ProgramFitBadge } from '@/src/components/workout/EquipmentCard'
import { EquipmentSheet } from '@/src/components/workout/EquipmentSheet'
import { AdaptProgramView } from '@/src/components/workout/AdaptProgramView'
import { MuscleInsightsCard } from '@/src/components/workout/MuscleInsightsCard'
import { ProgressionHint } from '@/src/components/workout/ProgressionHint'
import { LiveWorkout } from '@/src/components/workout/LiveWorkout'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Input } from '@/src/components/ui/Input'
import { Button } from '@/src/components/ui/Button'
import { StatCard } from '@/src/components/ui/StatCard'
import { BottomSheet } from '@/src/components/ui/BottomSheet'
import { AiChatSheet, type AiChatMessage } from '@/src/components/ai/AiChatSheet'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import type { Language, Translations } from '@/src/i18n'
import { useBottomTabPadding } from '@/src/hooks/useBottomTabPadding'
import { useProGate } from '@/src/hooks/useProGate'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

type WorkoutTab = 'today' | 'library' | 'programs' | 'history'

/** Programın planlanabilir günleri — dinlenme günleri takvime yazılmaz. */
function activeDays(program: WorkoutProgram | null): ProgramDay[] {
  return [...(program?.days ?? [])]
    .filter((d) => !d.is_rest)
    .sort((a, b) => a.day_number - b.day_number)
}

/** Egzersiz adı arayüz diline göre; İngilizce ad yoksa Türkçesi. */
function exerciseName(e: { name: string; name_en?: string | null } | null | undefined, lang: Language, t: Translations): string {
  if (!e) return t.wk_exercise
  return lang === 'en' ? (e.name_en ?? e.name) : e.name
}

/** Takvim etkinliğinin not alanı: o günün hareket listesi. */
function describeDay(day: ProgramDay | undefined, lang: Language, t: Translations): string {
  const exercises = [...(day?.exercises ?? [])].sort((a, b) => a.order_index - b.order_index)
  if (exercises.length === 0) return ''
  return exercises
    .map((ex) => `• ${exerciseName(ex.exercise, lang, t)} ${ex.sets}×${ex.reps ?? '-'}`)
    .join('\n')
}

const HISTORY_COLOR: Record<string, string> = {
  completed: palette.success,
  in_progress: palette.workout,
  planned: palette.accent,
  skipped: palette.warning,
}

/** ai-suggest'in antrenman koçundan dönen program önerisi. */
interface CoachProgramExercise { exercise_name: string; sets: number; reps: number; rest_seconds: number; notes: string | null }
interface CoachProgramDay { day_name: string; exercises: CoachProgramExercise[] }
interface CoachProgram {
  name: string
  description: string
  split_type: WorkoutProgram['split_type']
  days: CoachProgramDay[]
}


/** Kütüphane satırındaki eksik alet notu: "Alet yok: Kablo istasyonu". */
function missingLabel(exercise: Exercise, owned: EquipmentKey[] | null, lang: Language, t: Translations): string | null {
  const missing = missingEquipment(exercise, owned)
  if (missing.length === 0) return null
  return t.wk_missing_equipment.replace('{list}', missing.map((key) => equipmentLabel(key, lang)).join(', '))
}

/** Türkçe aksan ve noktalama farklarını eleyerek egzersiz adı eşler. */
function foldName(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export default function WorkoutScreen() {
  const { colors } = useTheme()
  const { t, lang } = useLang()
  const bottomPadding = useBottomTabPadding()
  const exName = (e: { name: string; name_en?: string | null } | null | undefined) => exerciseName(e, lang, t)
  const groupName = (g: { name: string; name_en: string } | null | undefined) => (g ? (lang === 'en' ? g.name_en : g.name) : '-')
  const categoryLabel = (c: string) => ({
    strength: t.wk_cat_strength, cardio: t.wk_cat_cardio, flexibility: t.wk_cat_flexibility, mobility: t.wk_cat_mobility,
  } as Record<string, string>)[c] ?? c
  const historyLabel = (s: string) => ({
    completed: t.wk_hist_completed, in_progress: t.wk_hist_in_progress, planned: t.wk_hist_planned, skipped: t.wk_hist_skipped,
  } as Record<string, string>)[s] ?? s
  const dayLabel = (day: { day_name: string | null; day_number: number }) => day.day_name?.trim() || t.wk_day_n.replace('{n}', String(day.day_number))
  const defaultDayNames = () => [1, 2, 3].map((n) => t.wk_day_n.replace('{n}', String(n)))
  const weekdayNames = t.routines_day_names.split(',')
  const { exercises, muscleGroups, todayWorkout, workoutHistory, programs, streak, equipment, equipmentLoaded, analyticsSets, analyticsLoaded, analyticsError, analyticsBodyWeightKg, analyticsGender, fetchLibrary, fetchTodayWorkout, fetchHistory, fetchStreak, fetchPrograms, fetchEquipment, fetchAnalytics, saveEquipment, applyProgramAdaptation, startWorkout, finishWorkout, removeWorkout, addSet, addSets, createProgramWithDays, createProgramFromPlan, addExerciseToDay, removeExerciseFromDay, deleteProgram } = useWorkoutStore()
  const [userId, setUserId] = useState<string | null>(null)
  const { isPro, isCheckingPro, requirePro } = useProGate(userId)
  const [tab, setTab] = useState<WorkoutTab>('today')
  const [refreshing, setRefreshing] = useState(false)
  const [setsExpanded, setSetsExpanded] = useState(false)
  /** Canlı ekrandaki hareketin ana kası; kas haritası onu seçili gösterir. */
  const [liveMuscleId, setLiveMuscleId] = useState<number | null>(null)

  // Start
  const [showStart, setShowStart] = useState(false)
  const [workoutName, setWorkoutName] = useState('')
  const [starting, setStarting] = useState(false)

  // Add set — selectedExercise stores the exercise object from DB
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null)
  const [setReps, setSetReps] = useState('10')
  const [setWeight, setSetWeight] = useState('')
  const [addingSet, setAddingSet] = useState(false)

  // Finish
  const [showFinish, setShowFinish] = useState(false)
  const [duration, setDuration] = useState('')
  const [finishing, setFinishing] = useState(false)

  // AI koç sohbeti
  const [showCoach, setShowCoach] = useState(false)
  const [coachMsgs, setCoachMsgs] = useState<AiChatMessage[]>([])
  const [coachInput, setCoachInput] = useState('')
  const [coachLoading, setCoachLoading] = useState(false)
  const [selectedProgram, setSelectedProgram] = useState<WorkoutProgram | null>(null)
  /** Program günü açık mı — hangi hareketlerin olduğunu başlatmadan görebilmek için */
  const [expandedDay, setExpandedDay] = useState<string | null>(null)

  // Kendi program oluşturma
  const [showCreateProgram, setShowCreateProgram] = useState(false)
  const [newProgramName, setNewProgramName] = useState('')
  const [newDayNames, setNewDayNames] = useState<string[]>(defaultDayNames)
  const [savingProgram, setSavingProgram] = useState(false)
  /** Hangi güne hareket ekleniyor — egzersiz seçicisini açar */
  const [addingToDay, setAddingToDay] = useState<string | null>(null)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerSets, setPickerSets] = useState('3')
  const [pickerReps, setPickerReps] = useState('10')

  /** Programı haftalık plana ve/veya cihaz takvimine yerleştirme ekranı */
  const [planningProgram, setPlanningProgram] = useState(false)
  const [planStartDate, setPlanStartDate] = useState(todayDate)
  const [planTime, setPlanTime] = useState(nextSlotTime)
  const [planWeeks, setPlanWeeks] = useState('4')
  const [planWeekdays, setPlanWeekdays] = useState<Record<string, number>>({})
  const [planToBlocks, setPlanToBlocks] = useState(true)
  const [planToCalendar, setPlanToCalendar] = useState(true)
  const [scheduling, setScheduling] = useState(false)

  /**
   * selectedProgram bir anlık kopya; hareket eklendikten sonra store tazelenir
   * ama kopya bayat kalır. Detay sayfası her zaman listedeki güncel kaydı okur.
   */
  const liveProgram = selectedProgram
    ? (programs.find((p) => p.id === selectedProgram.id) ?? selectedProgram)
    : null
  const isOwnProgram = liveProgram !== null && liveProgram.user_id !== null

  // Library search + filter
  const [search, setSearch] = useState('')
  const [filterGroupId, setFilterGroupId] = useState<number | null>(null)
  /** Kütüphane ve hareket seçicide yalnızca eldeki aletlerle yapılabilenler. */
  const [onlyAvailable, setOnlyAvailable] = useState(false)

  // Ekipman seçimi ve programı ekipmana uyarlama
  const [showEquipment, setShowEquipment] = useState(false)
  const [adaptingProgram, setAdaptingProgram] = useState(false)
  const [applyingAdaptation, setApplyingAdaptation] = useState(false)

  // toISOString() UTC verir; UTC+3'te gece yarısı–03:00 arası bir önceki günü
  // gösteriyordu. todayDate() yerel takvim günü.
  const todayStr = todayDate()

  const load = useCallback(async (uid: string) => {
    await Promise.all([fetchLibrary(supabase), fetchTodayWorkout(supabase, uid, todayStr), fetchHistory(supabase, uid), fetchStreak(supabase, uid), fetchPrograms(supabase, uid), fetchEquipment(supabase, uid), fetchAnalytics(supabase, uid)])
  }, [todayStr, fetchLibrary, fetchTodayWorkout, fetchHistory, fetchStreak, fetchPrograms, fetchEquipment, fetchAnalytics])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) { setUserId(data.user.id); void load(data.user.id) }
    })
  }, [load])

  async function handleRefresh() {
    if (!userId) return
    setRefreshing(true); await load(userId); setRefreshing(false)
  }

  async function handleStart() {
    if (!userId || starting || !workoutName.trim()) return
    if (todayWorkout) { setShowStart(false); return }  // aynı güne ikinci antrenman açma
    setStarting(true)
    try {
      await startWorkout(supabase, userId, { name: workoutName.trim(), date: todayStr, status: 'in_progress' })
      setWorkoutName(''); setShowStart(false)
      await fetchHistory(supabase, userId)
    } catch { Alert.alert(t.error, t.wk_err_start) }
    finally { setStarting(false) }
  }

  async function handleAddSet() {
    if (!todayWorkout || !selectedExercise || addingSet) return
    setAddingSet(true)
    try {
      // set_number = bu egzersizin kaçıncı seti (toplam set sayısı değil)
      const doneForExercise = todayWorkout.workout_sets?.filter((s) => s.exercise_id === selectedExercise.id).length ?? 0
      await addSet(supabase, {
        workout_id: todayWorkout.id,
        exercise_id: selectedExercise.id,
        reps: parseInt(setReps) || 10,
        weight_kg: setWeight ? parseFloat(setWeight) : undefined,
        set_number: doneForExercise + 1,
      })
      setSelectedExercise(null); setSetReps('10'); setSetWeight('')
    } catch { Alert.alert(t.error, t.wk_err_add_set) }
    finally { setAddingSet(false) }
  }

  async function handleFinish() {
    if (!todayWorkout || finishing) return
    setFinishing(true)
    try {
      await finishWorkout(supabase, todayWorkout.id, parseInt(duration) || 45)
      setShowFinish(false); setDuration('')
      // Seri de tazeleniyor: antrenmanı bitirip seriyi hâlâ eski hâliyle
      // görmek, kartın anlamını yok ediyor.
      if (userId) await Promise.all([fetchHistory(supabase, userId), fetchStreak(supabase, userId)])
    } catch { Alert.alert(t.error, t.wk_err_finish) }
    finally { setFinishing(false) }
  }

  function handleDeleteWorkout() {
    if (!todayWorkout) return
    const setCount = todayWorkout.workout_sets?.length ?? 0
    Alert.alert(
      t.wk_del_workout_title,
      t.wk_del_workout_msg.replace('{name}', todayWorkout.name ?? t.wk_today_workout).replace('{n}', String(setCount)),
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.wk_delete,
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await removeWorkout(supabase, todayWorkout.id)
                if (userId) await fetchHistory(supabase, userId)
              } catch { Alert.alert(t.error, t.wk_err_del_workout) }
            })()
          },
        },
      ],
    )
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

  async function handleStartFromProgramDay(program: WorkoutProgram, dayId: string) {
    if (!userId || starting) return  // çift dokunuş koruması
    const day = program.days?.find((d) => d.id === dayId)
    if (!day || day.is_rest) return

    const dayExercises = [...(day.exercises ?? [])].sort((a, b) => a.order_index - b.order_index)
    if (dayExercises.length === 0) {
      Alert.alert(t.wk_info, t.wk_day_no_exercises)
      return
    }
    if (todayWorkout?.status === 'completed') {
      Alert.alert(t.wk_done_title, t.wk_done_msg)
      return
    }

    const dayName = dayLabel(day)
    setStarting(true)
    setSelectedProgram(null)  // sheet'i hemen kapat — yükleme sürerken ikinci güne basılamasın
    setExpandedDay(null)
    try {
      // Bugün için zaten bir antrenman varsa yenisini açma, setleri onun üstüne ekle.
      const workout = todayWorkout ?? await startWorkout(supabase, userId, {
        name: `${program.name} · ${dayName}`,
        date: todayStr,
        status: 'in_progress',
      })

      // Tek bir bulk insert — eskiden her set ayrı istekti (15+ round-trip)
      await addSets(supabase, workout.id, programDaySetRows(workout.id, dayExercises, Date.now()))
      await fetchHistory(supabase, userId)
      setTab('today')
    } catch {
      Alert.alert(t.error, t.wk_err_start_day)
      if (userId) await fetchTodayWorkout(supabase, userId, todayStr)
    } finally {
      setStarting(false)
    }
  }

  function openProgramPlanner(program: WorkoutProgram | null = liveProgram) {
    const days = activeDays(program)
    const spread = spreadWeekdays(days.length)
    const map: Record<string, number> = {}
    days.forEach((day, i) => { map[day.id] = spread[i] ?? 1 })
    setPlanWeekdays(map)
    setPlanStartDate(todayDate())
    setPlanTime(nextSlotTime())
    setPlanningProgram(true)
  }

  /**
   * Programı somut tarihlere yazar.
   *
   * İki hedef aynı `planProgram()` çıktısını kullanıyor, dolayısıyla haftalık
   * plandaki blokla telefondaki etkinlik birbirinden kayamıyor.
   *
   * Takvim tarafı haftalık TEKRAR KURALI olan tek etkinlik yazıyor, hafta sayısı
   * kadar ayrı etkinlik değil: kullanıcı vazgeçtiğinde takvimden tek dokunuşla
   * silebilsin. Haftalık plan tarafında böyle bir imkân yok (bloklar tarih tarih
   * okunuyor), orada satırlar tek tek oluşuyor ama `createTimeBlocks` zaten var
   * olanı atlıyor — iki kez basmak kaydı ikiye katlamıyor.
   */
  async function handleScheduleProgram() {
    if (!userId || !liveProgram || scheduling) return

    if (!planToBlocks && !planToCalendar) {
      Alert.alert(t.wk_sched_target_title, t.wk_sched_target_msg)
      return
    }
    const days = activeDays(liveProgram)
    if (days.length === 0) {
      Alert.alert(t.wk_sched_empty_title, t.wk_sched_empty_msg)
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(planStartDate)) {
      Alert.alert(t.wk_sched_date_title, t.wk_sched_date_msg)
      return
    }
    if (!/^\d{1,2}:\d{2}$/.test(planTime)) {
      Alert.alert(t.wk_sched_time_title, t.wk_sched_time_msg)
      return
    }
    const weeks = Math.min(12, Math.max(1, parseInt(planWeeks, 10) || 4))

    const sessions = planProgram({
      days: days.map((day) => ({
        id: day.id,
        day_name: dayLabel(day),
        exercises: (day.exercises ?? []).map((ex) => ({ sets: ex.sets, rest_seconds: ex.rest_seconds })),
      })),
      weekdayByDay: planWeekdays,
      startDate: planStartDate,
      startTime: planTime,
      weeks,
    })

    setScheduling(true)
    try {
      const summary: string[] = []

      if (planToBlocks) {
        const rows = sessions.flatMap((session) =>
          session.dates.map((date) => ({
            date,
            start_time: session.startTime,
            end_time: session.endTime,
            block_type: 'workout' as const,
            label: `${liveProgram.name} · ${session.dayName}`,
            color: palette.workout,
          })),
        )
        const { inserted, skipped } = await createTimeBlocks(supabase, userId, rows)
        summary.push(
          t.wk_sched_blocks.replace('{n}', String(inserted)) + (skipped > 0 ? t.wk_sched_blocks_skipped.replace('{n}', String(skipped)) : ''),
        )
      }

      if (planToCalendar) {
        const granted = await requestCalendarPermission()
        const calendarId = granted ? await findWritableCalendarId() : null

        if (!granted) {
          summary.push(t.wk_sched_cal_denied)
        } else if (!calendarId) {
          summary.push(t.wk_sched_cal_none)
        } else {
          let events = 0
          for (const session of sessions) {
            const first = session.dates[0]
            if (!first) continue
            await createRecurringEvent(calendarId, {
              title: `${liveProgram.name} · ${session.dayName}`,
              notes: describeDay(days.find((d) => d.id === session.dayId), lang, t),
              startsAt: localDateTime(first, session.startTime),
              durationMinutes: session.durationMinutes,
              weeklyOccurrences: weeks,
              reminderMinutesBefore: 30,
            })
            events += 1
          }
          summary.push(t.wk_sched_cal_done.replace('{n}', String(events)).replace('{w}', String(weeks)))
        }
      }

      setPlanningProgram(false)
      setSelectedProgram(null)
      Alert.alert(t.wk_sched_done_title, summary.join('\n'))
    } catch (error) {
      console.warn('Program planlanamadı:', error)
      Alert.alert(t.error, t.wk_err_schedule)
    } finally {
      setScheduling(false)
    }
  }

  /**
   * Koçun yazdığı programı kaydedilebilir plana çevirir. Edge function egzersiz
   * adlarını kataloğa karşı doğruladığı için burada eşleşmeme beklenmiyor; yine de
   * kütüphane bayatsa hareket düşer, program yarım kaydedilmez.
   */
  function toProgramPlan(program: CoachProgram): AiProgramPlan | null {
    const byName = new Map(exercises.map((e) => [foldName(e.name), e.id]))
    const days = program.days.flatMap((day) => {
      const items = day.exercises.flatMap((ex) => {
        const id = byName.get(foldName(ex.exercise_name))
        if (!id) return []
        return [{ exercise_id: id, sets: ex.sets, reps: ex.reps, rest_seconds: ex.rest_seconds, notes: ex.notes }]
      })
      return items.length > 0 ? [{ day_name: day.day_name, exercises: items }] : []
    })
    if (days.length === 0) return null
    return { name: program.name, description: program.description, split_type: program.split_type, days }
  }

  function describeProgram(program: CoachProgram): string {
    return program.days
      .map((day) => {
        const lines = day.exercises
          .map((ex) => `  • ${ex.exercise_name}: ${ex.sets}x${ex.reps} · ${ex.rest_seconds}${t.coach_rest_sec}`)
          .join('\n')
        return `${day.day_name}\n${lines}`
      })
      .join('\n\n')
  }

  async function sendCoach(text: string) {
    const trimmed = text.trim()
    if (!trimmed || !userId || coachLoading) return
    if (!requirePro()) return

    const history = coachMsgs.slice(-8).map((m) => ({ role: m.role, text: m.content }))
    setCoachMsgs((m) => [...m, { role: 'user', content: trimmed }])
    setCoachInput('')
    setCoachLoading(true)
    try {
      const data = await callAiSuggest<{ message?: string; program?: CoachProgram | null }>({
        type: 'workout_program_chat',
        user_message: trimmed,
        workout_context: { history },
      })

      const program = data.program ?? null
      const plan = program ? toProgramPlan(program) : null
      const content = program
        ? `${data.message ?? ''}\n\n${program.name}\n${describeProgram(program)}`.trim()
        : (data.message ?? t.coach_no_reply)

      setCoachMsgs((m) => [...m, {
        role: 'assistant',
        content,
        actions: plan
          ? [{
              label: t.coach_save_program.replace('{n}', String(plan.days.length)),
              icon: 'bookmark-outline' as const,
              doneLabel: t.coach_saved,
              onPress: async () => {
                try {
                  const saved = await createProgramFromPlan(supabase, userId, plan)
                  // Kaydın hemen ardından planlayıcı açılıyor, varsayılanlar dolu:
                  // kullanıcı günleri ve saati görüp tek dokunuşla takvime yazar.
                  const full = useWorkoutStore.getState().programs.find((p) => p.id === saved.id) ?? saved
                  setShowCoach(false)
                  setTab('programs')
                  setSelectedProgram(full)
                  openProgramPlanner(full)
                } catch {
                  Alert.alert(t.error, t.coach_save_error)
                  throw new Error('save failed')
                }
              },
            }]
          : [],
      }])
    } catch (error) {
      setCoachMsgs((m) => [...m, { role: 'assistant', content: aiErrorMessage(error, t.coach_unreachable) }])
    } finally {
      setCoachLoading(false)
    }
  }

  // Süzgeç yalnızca seçim varken anlamlı; seçim yokken hiçbir şey elenmez.
  const equipmentFilterActive = equipment !== null && onlyAvailable

  const filteredExercises = exercises.filter((e) => {
    const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase()) || (e.name_en ?? '').toLowerCase().includes(search.toLowerCase())
    const matchGroup = !filterGroupId || e.muscle_group_id === filterGroupId
    const matchEquipment = !equipmentFilterActive || isExerciseAvailable(e, equipment)
    return matchSearch && matchGroup && matchEquipment
  })

  const pickerExercises = exercises
    .filter((e) => !pickerSearch || e.name.toLowerCase().includes(pickerSearch.toLowerCase()) || (e.name_en ?? '').toLowerCase().includes(pickerSearch.toLowerCase()))
    .filter((e) => !equipmentFilterActive || isExerciseAvailable(e, equipment))
    .slice(0, 25)

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

  const baseCoachSuggestions = [t.coach_suggestion_1, t.coach_suggestion_2, t.coach_suggestion_3, t.coach_suggestion_4]
  // Ekipman seçilmişse koç bunu zaten sunucu tarafında zorluyor; öneri yalnızca kullanıcıya bunu hatırlatır.
  const coachSuggestions = equipment === null ? baseCoachSuggestions : [t.coach_suggestion_equipment, ...baseCoachSuggestions]

  const liveActive = todayWorkout !== null && todayWorkout.status !== 'completed' && (todayWorkout.workout_sets?.length ?? 0) > 0
  const muscleCard = (
    <MuscleInsightsCard
      sets={analyticsSets}
      muscleGroups={muscleGroups}
      bodyWeightKg={analyticsBodyWeightKg}
      gender={analyticsGender}
      loading={!analyticsLoaded}
      error={analyticsError}
      focusMuscleId={liveActive ? liveMuscleId : null}
    />
  )

  const weekCount = workoutHistory.filter((w) => {
    const diff = (Date.now() - new Date(w.date).getTime()) / 86400000
    return diff <= 7
  }).length

  const TABS: { key: WorkoutTab; label: string }[] = [
    { key: 'today',    label: t.work_tab_today },
    { key: 'programs', label: t.work_tab_programs },
    { key: 'library',  label: t.work_tab_library },
    { key: 'history',  label: t.work_tab_history },
  ]

  const SPLIT_LABELS: Record<string, string> = {
    bro_split: 'Bro Split', push_pull_legs: 'Push Pull Legs',
    full_body: 'Full Body', upper_lower: 'Upper Lower', custom: t.wk_split_custom,
  }

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{ padding: spacing[5], paddingBottom: bottomPadding }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={palette.workout} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[5] }}>
          <Text style={{ fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, color: colors.textPrimary }}>{t.work_title}</Text>
          {tab === 'today' && todayWorkout && todayWorkout.status !== 'completed' && (
            <TouchableOpacity onPress={() => setTab('library')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing[4], paddingVertical: 10, borderRadius: radius.full, backgroundColor: `${palette.workout}18`, borderWidth: 1, borderColor: `${palette.workout}30` }}>
              <Ionicons name="search-outline" size={14} color={palette.workout} />
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.workout }}>{t.wk_add_exercise_btn}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tabs */}
        <View style={{ flexDirection: 'row', backgroundColor: colors.glassInner, borderRadius: radius.lg, padding: 4, marginBottom: spacing[5] }}>
          {TABS.map((t) => (
            <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} style={{ flex: 1, paddingVertical: 8, borderRadius: radius.md, alignItems: 'center', backgroundColor: tab === t.key ? colors.bgSurface : 'transparent', ...(tab === t.key ? colors.shadowCard : {}) }}>
              <Text style={{ fontSize: fontSize.sm, fontWeight: tab === t.key ? fontWeight.semibold : fontWeight.regular, color: tab === t.key ? colors.textPrimary : colors.textMuted }}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── TODAY ── */}
        {tab === 'today' && (
          <>
            {/* Ana eylem en üstte: antrenman yoksa başlat, varsa bugünkü antrenman */}
            {!todayWorkout && (
              <GlassCard style={{ marginBottom: spacing[4] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginBottom: spacing[4] }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: `${palette.workout}15`, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="barbell-outline" size={22} color={palette.workout} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{t.work_no_workout}</Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>{t.work_no_workout_hint}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => setShowStart(true)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: radius.full, backgroundColor: palette.workout }}
                >
                  <Ionicons name="play-circle-outline" size={20} color="#fff" />
                  <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.bold, color: '#fff' }}>{t.work_start}</Text>
                </TouchableOpacity>
              </GlassCard>
            )}

            {todayWorkout ? (
              <GlassCard style={{ marginBottom: spacing[4] }}>
                {/* Workout header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[3] }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], flex: 1 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${palette.workout}18`, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="barbell" size={20} color={palette.workout} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary }} numberOfLines={1}>{todayWorkout.name?.trim() || t.wk_workout}</Text>
                      <Text style={{ fontSize: fontSize.xs, color: todayWorkout.status === 'completed' ? palette.success : colors.textMuted }}>
                        {todayWorkout.status === 'completed'
                          ? `${t.work_completed} · ${t.wk_sets_n.replace('{n}', String(todayWorkout.workout_sets?.length ?? 0))}`
                          : t.wk_in_progress_sets.replace('{n}', String(todayWorkout.workout_sets?.length ?? 0))}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: spacing[2] }}>
                    {/* When completed: toggle sets visibility */}
                    {todayWorkout.status === 'completed' && (todayWorkout.workout_sets?.length ?? 0) > 0 && (
                      <TouchableOpacity
                        onPress={() => setSetsExpanded((v) => !v)}
                        style={{ paddingHorizontal: spacing[3], paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border }}
                      >
                        <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textMuted }}>
                          {setsExpanded ? t.work_hide_sets : t.work_show_sets}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {todayWorkout.status !== 'completed' && (
                      <TouchableOpacity onPress={() => setShowFinish(true)} style={{ paddingHorizontal: spacing[3], paddingVertical: 7, borderRadius: radius.full, backgroundColor: `${palette.success}18`, borderWidth: 1, borderColor: `${palette.success}30` }}>
                        <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: palette.success }}>{t.work_finish}</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={handleDeleteWorkout} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border }}>
                      <Ionicons name="trash-outline" size={14} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Süren antrenman: canlı ekran. Biten antrenman: açılır düz set listesi. */}
                {liveActive && userId && (
                  <LiveWorkout
                    workout={todayWorkout}
                    userId={userId}
                    onAddSet={(ex) => { setSelectedExercise(ex); setSetReps('10'); setSetWeight('') }}
                    onFocusMuscle={setLiveMuscleId}
                  />
                )}
                {todayWorkout.status !== 'completed' && (todayWorkout.workout_sets?.length ?? 0) === 0 && (
                  <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle, textAlign: 'center', paddingVertical: spacing[3] }}>
                    {t.work_exercise_search}
                  </Text>
                )}
                {todayWorkout.status === 'completed' && setsExpanded && (
                  <View style={{ gap: 2, marginBottom: spacing[4] }}>
                    {todayWorkout.workout_sets?.map((set: WorkoutSet) => <SetRow key={set.id} set={set} />)}
                  </View>
                )}

                {todayWorkout.status !== 'completed' && (
                  <View style={{ gap: spacing[3] }}>
                    <Input
                      value={search}
                      onChangeText={setSearch}
                      placeholder={t.work_exercise_search}
                    />
                    {search.trim().length > 0 && (
                      <View style={{ gap: spacing[2] }}>
                        {filteredExercises.slice(0, 5).map((ex) => (
                          <TouchableOpacity
                            key={ex.id}
                            onPress={() => { setSelectedExercise(ex); setSetReps('10'); setSetWeight(''); setSearch('') }}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], borderRadius: radius.md, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{exName(ex)}</Text>
                              <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>
                                {groupName(ex.muscle_group)} · {categoryLabel(ex.category)}
                                {ex.is_bodyweight ? ` · ${t.wk_bodyweight}` : ''}
                              </Text>
                            </View>
                            <View style={{ paddingHorizontal: spacing[3], paddingVertical: 6, borderRadius: radius.full, backgroundColor: `${palette.workout}18`, borderWidth: 1, borderColor: `${palette.workout}30` }}>
                              <Text style={{ fontSize: fontSize.xs, color: palette.workout, fontWeight: fontWeight.semibold }}>+ Set</Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                        {filteredExercises.length === 0 && (
                          <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle, textAlign: 'center', paddingVertical: spacing[2] }}>{t.work_no_results}</Text>
                        )}
                      </View>
                    )}
                  </View>
                )}
              </GlassCard>
            ) : null}

            {/* Antrenman sürerken harita canlı kartın hemen altında: işaretlenen set orada görünür. */}
            {liveActive && muscleCard}

            <StreakCard streak={streak} />

            <View style={{ flexDirection: 'row', gap: spacing[3], marginBottom: spacing[4] }}>
              <StatCard label={t.work_this_week} value={weekCount} color={palette.workout} />
              <StatCard label={t.work_today_sets} value={todayWorkout?.workout_sets?.length ?? 0} color={palette.accent} />
              <StatCard label={t.work_total} value={workoutHistory.length} />
            </View>

            <GlassCard style={{ marginBottom: spacing[4] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${palette.accent}18`, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={isPro ? 'sparkles' : 'lock-closed-outline'} size={18} color={palette.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{t.coach_title}</Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>
                    {t.coach_subtitle}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => { if (requirePro()) setShowCoach(true) }}
                  disabled={isCheckingPro}
                  style={{ paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: radius.full, backgroundColor: `${palette.accent}18`, borderWidth: 1, borderColor: `${palette.accent}35`, opacity: isPro ? 1 : 0.6 }}
                >
                  <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: palette.accent }}>
                    {isPro ? t.coach_chat : 'Pro'}
                  </Text>
                </TouchableOpacity>
              </View>
            </GlassCard>

            {!liveActive && muscleCard}
          </>
        )}

        {/* ── LIBRARY ── */}
        {tab === 'library' && (
          <>
            <Input value={search} onChangeText={setSearch} placeholder={t.wk_library_search} containerStyle={{ marginBottom: spacing[3] }} />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing[4] }}>
              <View style={{ flexDirection: 'row', gap: spacing[2] }}>
                {equipment !== null && (
                  <TouchableOpacity onPress={() => setOnlyAvailable((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing[3], paddingVertical: 7, borderRadius: radius.full, backgroundColor: onlyAvailable ? palette.success : colors.glassInner, borderWidth: 1, borderColor: onlyAvailable ? palette.success : colors.border }}>
                    <Ionicons name="construct-outline" size={12} color={onlyAvailable ? '#fff' : colors.textMuted} />
                    <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: onlyAvailable ? '#fff' : colors.textMuted }}>{t.wk_fits_mine}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setFilterGroupId(null)} style={{ paddingHorizontal: spacing[3], paddingVertical: 7, borderRadius: radius.full, backgroundColor: !filterGroupId ? palette.accent : colors.glassInner, borderWidth: 1, borderColor: !filterGroupId ? palette.accent : colors.border }}>
                  <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: !filterGroupId ? '#fff' : colors.textMuted }}>{t.wk_all_n.replace('{n}', String(exercises.length))}</Text>
                </TouchableOpacity>
                {muscleGroups.map((mg) => (
                  <TouchableOpacity key={mg.id} onPress={() => setFilterGroupId(filterGroupId === mg.id ? null : mg.id)} style={{ paddingHorizontal: spacing[3], paddingVertical: 7, borderRadius: radius.full, backgroundColor: filterGroupId === mg.id ? palette.workout : colors.glassInner, borderWidth: 1, borderColor: filterGroupId === mg.id ? palette.workout : colors.border }}>
                    <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: filterGroupId === mg.id ? '#fff' : colors.textMuted }}>{groupName(mg)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, marginBottom: spacing[3] }}>
              {t.wk_n_exercises.replace('{n}', String(filteredExercises.length))}{todayWorkout && todayWorkout.status !== 'completed' ? t.wk_add_set_hint : ''}
            </Text>

            <View style={{ gap: spacing[2] }}>
              {filteredExercises.map((ex) => (
                <GlassCard key={ex.id} padding={spacing[4]} noShadow>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{exName(ex)}</Text>
                      <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 }}>
                        {groupName(ex.muscle_group)} · {categoryLabel(ex.category)}
                        {ex.is_bodyweight ? ` · ${t.wk_bodyweight}` : ''}
                      </Text>
                      {missingLabel(ex, equipment, lang, t) && (
                        <Text style={{ fontSize: fontSize.xs, color: palette.warning, marginTop: 2 }}>{missingLabel(ex, equipment, lang, t)}</Text>
                      )}
                    </View>
                    {todayWorkout && todayWorkout.status !== 'completed' && (
                      <TouchableOpacity
                        onPress={() => { setSelectedExercise(ex); setSetReps('10'); setSetWeight('') }}
                        style={{ paddingHorizontal: spacing[3], paddingVertical: 7, borderRadius: radius.full, backgroundColor: `${palette.workout}18`, borderWidth: 1, borderColor: `${palette.workout}30` }}
                      >
                        <Text style={{ fontSize: fontSize.xs, color: palette.workout, fontWeight: fontWeight.semibold }}>+ Set</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </GlassCard>
              ))}
              {filteredExercises.length === 0 && (
                <View style={{ paddingTop: spacing[8], alignItems: 'center' }}>
                  <Text style={{ color: colors.textSubtle }}>{t.work_no_results}</Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* ── PROGRAMS ── */}
        {tab === 'programs' && (
          <View style={{ gap: spacing[3] }}>
            <EquipmentCard equipment={equipment} loaded={equipmentLoaded} onEdit={() => setShowEquipment(true)} />
            <TouchableOpacity
              onPress={() => { setNewProgramName(''); setNewDayNames(defaultDayNames()); setShowCreateProgram(true) }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], paddingVertical: spacing[3], borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.accent }}
            >
              <Ionicons name="add" size={18} color={palette.accent} />
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.accent }}>{t.wk_create_own}</Text>
            </TouchableOpacity>
            {programs.length === 0 ? (
              <View style={{ paddingTop: spacing[8], alignItems: 'center', gap: spacing[3] }}>
                <Ionicons name="list-outline" size={48} color={colors.textSubtle} />
                <Text style={{ fontSize: fontSize.base, color: colors.textSubtle }}>{t.wk_programs_failed}</Text>
                <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle, textAlign: 'center' }}>{t.wk_programs_failed_hint}</Text>
              </View>
            ) : (
              sortedPrograms.map((prog) => (
                <ProgramCard
                  key={prog.id}
                  program={prog}
                  splitLabel={SPLIT_LABELS[prog.split_type] ?? prog.split_type}
                  fit={fitByProgram.get(prog.id) ?? null}
                  onStart={() => { setSelectedProgram(prog); setExpandedDay(null) }}
                />
              ))
            )}
          </View>
        )}

        {/* ── HISTORY ── */}
        {tab === 'history' && (
          workoutHistory.length === 0 ? (
            <View style={{ paddingTop: spacing[8], alignItems: 'center', gap: spacing[3] }}>
              <Ionicons name="time-outline" size={48} color={colors.textSubtle} />
              <Text style={{ fontSize: fontSize.base, color: colors.textSubtle }}>{t.wk_no_history}</Text>
            </View>
          ) : (
            <View style={{ gap: spacing[3] }}>
              {workoutHistory.map((w) => (
                <GlassCard key={w.id} padding={spacing[4]} noShadow>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{w.name?.trim() || t.wk_workout}</Text>
                      <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 }}>
                        {new Date(w.date).toLocaleDateString(lang === 'en' ? 'en-US' : 'tr-TR', { day: 'numeric', month: 'short', weekday: 'short' })}
                        {w.duration_minutes ? ` · ${t.wk_min_n.replace('{n}', String(w.duration_minutes))}` : ''}
                      </Text>
                    </View>
                    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.md, backgroundColor: `${HISTORY_COLOR[w.status] ?? palette.warning}18` }}>
                      <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: HISTORY_COLOR[w.status] ?? palette.warning }}>
                        {historyLabel(w.status)}
                      </Text>
                    </View>
                  </View>
                </GlassCard>
              ))}
            </View>
          )
        )}
      </ScrollView>

      {/* Start workout */}
      <BottomSheet visible={showStart} onClose={() => setShowStart(false)} title={t.work_start_modal}>
        <View style={{ gap: spacing[4] }}>
          <Input label={t.wk_workout_name} value={workoutName} onChangeText={setWorkoutName} placeholder={t.wk_workout_name_ph} autoFocus />
          <Button label={starting ? t.wk_starting : t.wk_start} onPress={handleStart} loading={starting} fullWidth />
        </View>
      </BottomSheet>

      {/* Add set (exercise selected from library) */}
      <BottomSheet visible={!!selectedExercise} onClose={() => setSelectedExercise(null)} title={t.wk_add_set}>
        <View style={{ gap: spacing[4] }}>
          {selectedExercise && (
            <View style={{ padding: spacing[3], borderRadius: radius.lg, backgroundColor: `${palette.workout}10`, borderWidth: 1, borderColor: `${palette.workout}25` }}>
              <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{exName(selectedExercise)}</Text>
              <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 }}>
                {groupName(selectedExercise.muscle_group)} · {categoryLabel(selectedExercise.category)}
              </Text>
            </View>
          )}
          {selectedExercise && userId && (
            <ProgressionHint
              exercise={selectedExercise}
              userId={userId}
              excludeWorkoutId={todayWorkout?.id}
              onApply={(reps, weightKg) => {
                setSetReps(String(reps))
                setSetWeight(weightKg !== null ? String(weightKg) : '')
              }}
            />
          )}
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <Input label={t.wk_reps} value={setReps} onChangeText={setSetReps} keyboardType="number-pad" placeholder="10" containerStyle={{ flex: 1 }} />
            {!selectedExercise?.is_bodyweight && (
              <Input label={t.wk_weight_kg} value={setWeight} onChangeText={setSetWeight} keyboardType="decimal-pad" placeholder="60" containerStyle={{ flex: 1 }} />
            )}
          </View>
          <Button label={addingSet ? t.wk_adding : t.wk_add_set} onPress={handleAddSet} loading={addingSet} fullWidth />
        </View>
      </BottomSheet>

      {/* Finish */}
      <BottomSheet visible={showFinish} onClose={() => setShowFinish(false)} title={t.wk_finish_title}>
        <View style={{ gap: spacing[4] }}>
          <Input label={t.wk_total_minutes} value={duration} onChangeText={setDuration} keyboardType="number-pad" placeholder="45" autoFocus />
          <Button label={finishing ? t.wk_saving : t.wk_finish} onPress={handleFinish} loading={finishing} fullWidth />
        </View>
      </BottomSheet>

      {/*
        Program detayı ve hareket seçici AYNI sayfada, iç içe geçmiş iki
        BottomSheet olarak değil: iOS zaten görünür bir modalin üstüne ikinci
        modal açmıyor ("Hareket Ekle"ye basınca hiçbir şey olmuyordu). Seçici
        açıkken gün listesinin yerini alıyor, geri düğmesiyle dönülüyor.
      */}
      <BottomSheet
        visible={!!selectedProgram}
        onClose={() => { setSelectedProgram(null); setExpandedDay(null); setAddingToDay(null); setPlanningProgram(false); setAdaptingProgram(false) }}
        title={addingToDay ? t.wk_add_movement : planningProgram ? t.wk_plan_program : adaptingProgram ? t.wk_adapt_title : (liveProgram ? liveProgram.name : t.wk_program)}
        scrollable
      >
        {adaptingProgram && liveProgram && equipment !== null ? (
          <AdaptProgramView
            program={liveProgram}
            catalog={exercises}
            owned={equipment}
            applying={applyingAdaptation}
            onBack={() => setAdaptingProgram(false)}
            onApply={(adaptation) => void handleApplyAdaptation(adaptation)}
          />
        ) : addingToDay ? (
          <View style={{ gap: spacing[3] }}>
            <TouchableOpacity
              onPress={() => { setAddingToDay(null); setPickerSearch('') }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}
            >
              <Ionicons name="chevron-back" size={16} color={palette.accent} />
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.accent }}>{t.wk_back_to_program}</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              <Input label={t.wk_sets} value={pickerSets} onChangeText={setPickerSets} keyboardType="number-pad" containerStyle={{ flex: 1 }} />
              <Input label={t.wk_reps} value={pickerReps} onChangeText={setPickerReps} keyboardType="number-pad" containerStyle={{ flex: 1 }} />
            </View>
            <Input label={t.wk_search_exercise} value={pickerSearch} onChangeText={setPickerSearch} placeholder="hip thrust, squat..." />
            {equipment !== null && (
              <TouchableOpacity onPress={() => setOnlyAvailable((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                <Ionicons name={onlyAvailable ? 'checkbox' : 'square-outline'} size={18} color={onlyAvailable ? palette.workout : colors.textSubtle} />
                <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>{t.wk_only_mine}</Text>
              </TouchableOpacity>
            )}
            {pickerExercises.map((e) => {
              const missing = missingLabel(e, equipment, lang, t)
              return (
                <TouchableOpacity
                  key={e.id}
                  onPress={() => void handleAddExerciseToDay(e.id)}
                  style={{ paddingVertical: spacing[3], paddingHorizontal: spacing[3], borderRadius: radius.lg, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border }}
                >
                  <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{exName(e)}</Text>
                  {e.muscle_group && (
                    <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>{groupName(e.muscle_group)}</Text>
                  )}
                  {missing && (
                    <Text style={{ fontSize: fontSize.xs, color: palette.warning, marginTop: 2 }}>{missing}</Text>
                  )}
                </TouchableOpacity>
              )
            })}
            {pickerExercises.length === 0 && (
              <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle, textAlign: 'center', paddingVertical: spacing[2] }}>{t.work_no_results}</Text>
            )}
          </View>
        ) : planningProgram ? (
          <View style={{ gap: spacing[3] }}>
            <TouchableOpacity
              onPress={() => setPlanningProgram(false)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}
            >
              <Ionicons name="chevron-back" size={16} color={palette.accent} />
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.accent }}>{t.wk_back_to_program}</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              <Input label={t.wk_start_date} value={planStartDate} onChangeText={setPlanStartDate} placeholder="2026-09-08" containerStyle={{ flex: 1.5 }} />
              <Input label={t.wk_time} value={planTime} onChangeText={setPlanTime} placeholder="18:00" containerStyle={{ flex: 1 }} />
              <Input label={t.wk_weeks} value={planWeeks} onChangeText={setPlanWeeks} keyboardType="number-pad" containerStyle={{ flex: 0.8 }} />
            </View>

            {/* Her antrenman gününe bir hafta günü. Varsayılan dağılım
                spreadWeekdays'ten geliyor (3 gün → Pzt/Çar/Cum). */}
            {activeDays(liveProgram).map((day) => {
              const minutes = estimateWorkoutMinutes(
                (day.exercises ?? []).map((ex) => ({ sets: ex.sets, rest_seconds: ex.rest_seconds })),
              )
              return (
                <View key={day.id} style={{ gap: spacing[2] }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
                      {dayLabel(day)}
                    </Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{t.wk_approx_min.replace('{n}', String(minutes))}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {WEEKDAY_ORDER.map((weekday) => {
                      const active = planWeekdays[day.id] === weekday
                      return (
                        <TouchableOpacity
                          key={weekday}
                          onPress={() => setPlanWeekdays((map) => ({ ...map, [day.id]: weekday }))}
                          style={{ flex: 1, paddingVertical: 7, borderRadius: radius.md, alignItems: 'center', backgroundColor: active ? palette.workout : colors.glassInner, borderWidth: 1, borderColor: active ? palette.workout : colors.border }}
                        >
                          <Text style={{ fontSize: fontSize.xs, fontWeight: active ? fontWeight.semibold : fontWeight.regular, color: active ? '#fff' : colors.textMuted }}>
                            {weekdayNames[weekday]}
                          </Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </View>
              )
            })}

            <TargetToggle
              label={t.wk_to_blocks}
              hint={t.wk_to_blocks_hint}
              value={planToBlocks}
              onToggle={() => setPlanToBlocks((v) => !v)}
            />
            <TargetToggle
              label={t.wk_to_calendar}
              hint={t.wk_to_calendar_hint}
              value={planToCalendar}
              onToggle={() => setPlanToCalendar((v) => !v)}
            />

            <Button
              label={scheduling ? t.wk_scheduling : t.wk_schedule}
              onPress={() => void handleScheduleProgram()}
              loading={scheduling}
              fullWidth
            />
          </View>
        ) : (
        <View style={{ gap: spacing[2] }}>
          {/* Yalnızca gerçekten uyarlanacak bir şey varken: tamamı uygun
              programda düğme göstermek "bir şey eksik mi" diye düşündürür. */}
          {canAdapt && liveFit && (
            <TouchableOpacity
              onPress={() => setAdaptingProgram(true)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], paddingVertical: spacing[3], borderRadius: radius.lg, backgroundColor: `${palette.warning}15`, borderWidth: 1, borderColor: `${palette.warning}40` }}
            >
              <Ionicons name="construct-outline" size={16} color={palette.warning} />
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.warning }}>
                {t.wk_adapt_btn.replace('{n}', String(liveFit.total - liveFit.available))}
              </Text>
            </TouchableOpacity>
          )}

          {activeDays(liveProgram).length > 0 && (
            <TouchableOpacity
              onPress={() => openProgramPlanner()}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], paddingVertical: spacing[3], borderRadius: radius.lg, backgroundColor: `${palette.workout}18`, borderWidth: 1, borderColor: `${palette.workout}40`, marginBottom: spacing[1] }}
            >
              <Ionicons name="calendar-outline" size={16} color={palette.workout} />
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.workout }}>
                {t.wk_add_to_calendar}
              </Text>
            </TouchableOpacity>
          )}

          {todayWorkout && todayWorkout.status !== 'completed' && (
            <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginBottom: spacing[1] }}>
              {t.wk_open_workout_note}
            </Text>
          )}
          {(liveProgram?.days ?? []).filter((d) => !d.is_rest).map((day) => {
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
                  onPress={() => setExpandedDay(isOpen ? null : day.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing[3], paddingHorizontal: spacing[3] }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{dayLabel(day)}</Text>
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
                          {exName(ex.exercise)}
                        </Text>
                        {ex.exercise && !isExerciseAvailable(ex.exercise, equipment) && (
                          <Ionicons name="alert-circle-outline" size={14} color={palette.warning} />
                        )}
                        <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
                          {ex.sets}×{ex.reps ?? '-'} · {ex.rest_seconds}{t.coach_rest_sec}
                        </Text>
                        {isOwnProgram && (
                          <TouchableOpacity onPress={() => void handleRemoveProgramExercise(ex.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
                        onPress={() => { setAddingToDay(day.id); setPickerSearch(''); setPickerSets('3'); setPickerReps('10') }}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[1], paddingVertical: spacing[2], borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong }}
                      >
                        <Ionicons name="add" size={16} color={palette.accent} />
                        <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: palette.accent }}>{t.wk_add_movement}</Text>
                      </TouchableOpacity>
                    )}

                    {exCount > 0 && (
                      <TouchableOpacity
                        disabled={starting}
                        onPress={() => void handleStartFromProgramDay(liveProgram as WorkoutProgram, day.id)}
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

          {isOwnProgram && liveProgram && (
            <TouchableOpacity onPress={() => handleDeleteProgram(liveProgram)} style={{ paddingVertical: spacing[3], alignItems: 'center' }}>
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.danger }}>{t.wk_delete_program}</Text>
            </TouchableOpacity>
          )}
        </View>
        )}
      </BottomSheet>

      {/* Kendi programını oluştur */}
      <BottomSheet
        visible={showCreateProgram}
        onClose={() => setShowCreateProgram(false)}
        title={t.wk_create_own}
        scrollable
      >
        <View style={{ gap: spacing[3] }}>
          <Input label={t.wk_program_name} value={newProgramName} onChangeText={setNewProgramName} placeholder={t.wk_program_name_ph} />

          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary }}>
            {t.wk_weekly_days.replace('{n}', String(newDayNames.length))}
          </Text>
          <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
            {t.wk_create_hint}
          </Text>

          {newDayNames.map((name, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
              <Input
                value={name}
                onChangeText={(value) => setNewDayNames((days) => days.map((d, index) => index === i ? value : d))}
                placeholder={t.wk_day_n.replace('{n}', String(i + 1))}
                containerStyle={{ flex: 1 }}
              />
              {newDayNames.length > 1 && (
                <TouchableOpacity onPress={() => setNewDayNames((days) => days.filter((_, index) => index !== i))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={20} color={colors.textSubtle} />
                </TouchableOpacity>
              )}
            </View>
          ))}

          {newDayNames.length < 7 && (
            <TouchableOpacity
              onPress={() => setNewDayNames((days) => [...days, t.wk_day_n.replace('{n}', String(days.length + 1))])}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[1], paddingVertical: spacing[2], borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong }}
            >
              <Ionicons name="add" size={16} color={palette.accent} />
              <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: palette.accent }}>{t.wk_add_day}</Text>
            </TouchableOpacity>
          )}

          <Button
            label={savingProgram ? t.wk_creating : t.wk_create_program}
            onPress={() => void handleCreateProgram()}
            loading={savingProgram}
            fullWidth
          />
        </View>
      </BottomSheet>

      <AiChatSheet
        visible={showCoach}
        onClose={() => setShowCoach(false)}
        title={t.coach_title}
        accent={palette.accent}
        messages={coachMsgs}
        loading={coachLoading}
        input={coachInput}
        onChangeInput={setCoachInput}
        onSend={() => { void sendCoach(coachInput) }}
        placeholder={t.coach_placeholder}
        emptyHint={t.coach_empty_hint}
        suggestions={coachSuggestions}
        onSuggestionPress={(text) => { void sendCoach(text) }}
      />

      <EquipmentSheet
        visible={showEquipment}
        onClose={() => setShowEquipment(false)}
        initial={equipment}
        onSave={async (keys) => { if (userId) await saveEquipment(supabase, userId, keys) }}
      />
    </ScreenBackground>
  )
}

function ProgramCard({ program, splitLabel, fit, onStart }: { program: WorkoutProgram; splitLabel: string; fit: ProgramEquipmentFit | null; onStart: () => void }) {
  const { colors } = useTheme()
  const { t } = useLang()
  const isGlobal = program.user_id === null
  const dayCount = program.days?.filter((d) => !d.is_rest).length ?? program.frequency_per_week

  return (
    <GlassCard padding={spacing[4]} noShadow>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: spacing[3] }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginBottom: 4 }}>
            <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary }}>{program.name}</Text>
            {isGlobal && (
              <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full, backgroundColor: `${palette.accent}15` }}>
                <Text style={{ fontSize: fontSize.xs, color: palette.accent, fontWeight: fontWeight.medium }}>{t.wk_template}</Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }} numberOfLines={2}>{program.description}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginBottom: spacing[3] }}>
        <View style={{ paddingHorizontal: spacing[3], paddingVertical: 4, borderRadius: radius.full, backgroundColor: `${palette.workout}12`, borderWidth: 1, borderColor: `${palette.workout}25` }}>
          <Text style={{ fontSize: fontSize.xs, color: palette.workout, fontWeight: fontWeight.medium }}>{splitLabel}</Text>
        </View>
        <View style={{ paddingHorizontal: spacing[3], paddingVertical: 4, borderRadius: radius.full, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{t.wk_days_per_week.replace('{n}', String(dayCount))}</Text>
        </View>
        <ProgramFitBadge fit={fit} />
      </View>

      {/* Day names */}
      {program.days && program.days.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1], marginBottom: spacing[3] }}>
          {program.days.slice(0, 6).map((day) => (
            <View key={day.id} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: day.is_rest ? colors.glassInner : `${palette.workout}10` }}>
              <Text style={{ fontSize: fontSize.xs, color: day.is_rest ? colors.textSubtle : palette.workout }}>
                {day.is_rest ? t.wk_rest_day : day.day_name}
              </Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        onPress={onStart}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: palette.workout }}
      >
        <Ionicons name="play-circle-outline" size={16} color="#fff" />
        {/* Artık doğrudan başlatmıyor: önce günleri ve hareketleri gösteriyor. */}
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: '#fff' }}>{t.wk_view_program}</Text>
      </TouchableOpacity>
    </GlassCard>
  )
}

function SetRow({ set }: { set: WorkoutSet }) {
  const { colors } = useTheme()
  const { t, lang } = useLang()
  const name = set.exercise ? exerciseName(set.exercise, lang, t) : t.wk_exercise_n.replace('{n}', String(set.set_number))
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[2], borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing[3] }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: `${palette.workout}18`, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: palette.workout }}>{set.set_number}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{name}</Text>
        <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
          {t.wk_reps_n.replace('{n}', String(set.reps ?? '-'))}{set.weight_kg ? ` · ${set.weight_kg}kg` : ''}
        </Text>
      </View>
    </View>
  )
}

/** Program planlayıcıdaki "nereye yazılsın" seçeneği. */
function TargetToggle({ label, hint, value, onToggle }: { label: string; hint: string; value: boolean; onToggle: () => void }) {
  const { colors } = useTheme()
  return (
    <TouchableOpacity
      onPress={onToggle}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], paddingHorizontal: spacing[3], borderRadius: radius.lg, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: value ? palette.workout : colors.border }}
    >
      <Ionicons
        name={value ? 'checkbox' : 'square-outline'}
        size={20}
        color={value ? palette.workout : colors.textSubtle}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{label}</Text>
        <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 }}>{hint}</Text>
      </View>
    </TouchableOpacity>
  )
}
