import { useRef, useState } from 'react'
import { Alert } from 'react-native'
import { elapsedMinutes, planProgramDayStart, programDaySetRows, resolveDuration, summarizeWorkout, useWorkoutStore } from '@lifeos/shared'
import { getExerciseSessions, updateWorkout } from '@lifeos/shared/supabase'
import type { Exercise, ExerciseSession, WorkoutProgram, WorkoutSummary } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { useLang } from '@/src/contexts/LangContext'
import { programDayLabel } from '@/src/components/workout/programDays'

interface Options {
  userId: string | null
  /** Yerel takvim günü (YYYY-AA-GG). */
  todayStr: string
  /** Program günü başlatılmak üzere: program sayfası hemen kapanır. */
  onProgramDayAccepted: () => void
  /** Program gününün setleri yazıldı: ekran Bugün sekmesine döner. */
  onProgramDayStarted: () => void
}

/** Rekor kıyası için geriye bakılan seans sayısı (son 120 antrenmanla sınırlı). */
const RECORD_LOOKBACK_SESSIONS = 120

/** Bitir sheet'inin özet görünümü: kayıttan sonra aynı sheet'te gösterilir. */
export interface FinishSummary extends WorkoutSummary {
  durationMin: number
  /** Rekor kıran hareketler (ad göstermek için). */
  exercises: Exercise[]
}

/** Tamamlanmamış setler için seçim: silinir ya da yapıldı sayılır. */
export type UnfinishedChoice = 'delete' | 'complete'

/** Bugünkü antrenmanın akışı: başlat, bitir, sil ve program gününden başlat. */
export function useWorkoutSession({ userId, todayStr, onProgramDayAccepted, onProgramDayStarted }: Options) {
  const { t } = useLang()
  const { todayWorkout, startWorkout, finishWorkout, removeWorkout, addSets, fetchHistory, fetchStreak, fetchTodayWorkout } = useWorkoutStore()

  // Start
  const [showStart, setShowStart] = useState(false)
  const [workoutName, setWorkoutName] = useState('')
  const [starting, setStarting] = useState(false)
  // Durum bir sonraki çizimde güncellenir: hızlı ikinci dokunuş aynı güne iki antrenman açıyordu.
  const startingRef = useRef(false)

  // Finish
  const [showFinish, setShowFinish] = useState(false)
  const [duration, setDuration] = useState('')
  const [finishing, setFinishing] = useState(false)
  const [unfinishedChoice, setUnfinishedChoice] = useState<UnfinishedChoice>('delete')
  const [finishError, setFinishError] = useState<string | null>(null)
  const [summary, setSummary] = useState<FinishSummary | null>(null)

  async function handleStart() {
    if (!userId || startingRef.current) return
    if (todayWorkout) { setShowStart(false); return }  // aynı güne ikinci antrenman açma
    startingRef.current = true
    setStarting(true)
    try {
      // Ad boşsa varsayılan ad: sessizce hiçbir şey yapmamak yerine antrenman açılır.
      const name = workoutName.trim() || t.wkf_default_workout_name
      await startWorkout(supabase, userId, { name, date: todayStr, status: 'in_progress' })
      setWorkoutName(''); setShowStart(false)
      await fetchHistory(supabase, userId)
    } catch { Alert.alert(t.error, t.wk_err_start) }
    finally { startingRef.current = false; setStarting(false) }
  }

  /** Bitir sheet'ini açar: süre, antrenmanın başlangıcından geçen dakikayla dolar. */
  function openFinish() {
    if (!todayWorkout) return
    setDuration(String(elapsedMinutes(todayWorkout.created_at, Date.now())))
    setUnfinishedChoice('delete')
    setFinishError(null)
    setSummary(null)
    setShowFinish(true)
  }

  /** Sheet kapanır (Tamam ya da aşağı çekme); kayıt sürerken kapanmaz. Dünden kalan bittiyse bugün yeniden okunur. */
  function closeFinish() {
    if (finishing) return
    const carried = summary !== null && todayWorkout !== null && todayWorkout.date !== todayStr
    setShowFinish(false); setSummary(null); setFinishError(null)
    if (carried && userId) void fetchTodayWorkout(supabase, userId, todayStr)
  }

  async function handleFinish() {
    if (!todayWorkout || finishing) return
    const workout = todayWorkout
    const sets = workout.workout_sets ?? []
    const undone = sets.filter((s) => !s.completed)
    const choice = undone.length > 0 ? unfinishedChoice : null
    const ids = undone.map((s) => s.id)
    const counted = choice === 'delete' ? sets.filter((s) => s.completed) : sets
    const durationMin = resolveDuration(duration, elapsedMinutes(workout.created_at, Date.now()))

    setFinishing(true)
    setFinishError(null)
    try {
      await finishWorkout(
        supabase, workout.id, durationMin, undefined,
        choice === 'delete' ? { deleteSetIds: ids } : choice === 'complete' ? { completeSetIds: ids } : undefined,
      )
    } catch {
      // Girdiler (süre, seçim) korunur; hata sheet içinde görünür.
      // Set işlemlerinin bir kısmı yazılmış olabilir: ekran veritabanıyla yeniden eşlenir.
      if (userId) void fetchTodayWorkout(supabase, userId, todayStr)
      setFinishError(t.wkf_err_finish)
      setFinishing(false)
      return
    }

    // Kayıt tamam; bundan sonrası en iyi çaba: özet ve tazeleme kaydı başarısız saymaz.
    const exerciseIds = [...new Set(counted.map((s) => s.exercise_id))]
    const history: Record<string, ExerciseSession[]> = {}
    if (userId) {
      const results = await Promise.allSettled(exerciseIds.map((id) => getExerciseSessions(supabase, userId, id, RECORD_LOOKBACK_SESSIONS, workout.id)))
      results.forEach((r, i) => { const id = exerciseIds[i]; if (r.status === 'fulfilled' && id) history[id] = r.value })
      await Promise.allSettled([fetchHistory(supabase, userId), fetchStreak(supabase, userId)])
    }
    const result = summarizeWorkout(counted, history)
    const recordIds = new Set(result.records.map((r) => r.exerciseId))
    const exercises: Exercise[] = []
    for (const s of counted) {
      if (s.exercise && recordIds.has(s.exercise_id) && !exercises.some((e) => e.id === s.exercise_id)) exercises.push(s.exercise)
    }
    setSummary({ ...result, durationMin, exercises })
    setFinishing(false)
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

  async function handleStartFromProgramDay(program: WorkoutProgram, dayId: string) {
    if (!userId || startingRef.current) return  // çift dokunuş koruması
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
    if (todayWorkout && todayWorkout.date !== todayStr) {
      Alert.alert(t.wk_info, t.wkf_finish_open_first)
      return
    }

    const dayName = programDayLabel(day, t)
    startingRef.current = true
    setStarting(true)
    onProgramDayAccepted()  // sheet'i hemen kapat: yükleme sürerken ikinci güne basılamasın
    try {
      // Aynı program günü ikinci kez başlatılınca setler ikiye katlanmaz, bkz. planProgramDayStart.
      const fullName = `${program.name} · ${dayName}`
      const plan = planProgramDayStart(todayWorkout, fullName, dayExercises)
      const workout = plan.create || !todayWorkout
        ? await startWorkout(supabase, userId, { name: fullName, date: todayStr, status: 'in_progress' })
        : todayWorkout
      if (plan.rename) await updateWorkout(supabase, workout.id, { name: plan.rename })

      // Tek bir bulk insert: eskiden her set ayrı istekti (15+ round-trip)
      if (plan.exercises.length > 0) {
        await addSets(supabase, workout.id, programDaySetRows(workout.id, plan.exercises, Date.now()))
      }
      await Promise.all([fetchTodayWorkout(supabase, userId, todayStr), fetchHistory(supabase, userId)])
      onProgramDayStarted()
    } catch {
      Alert.alert(t.error, t.wk_err_start_day)
      if (userId) await fetchTodayWorkout(supabase, userId, todayStr)
    } finally {
      startingRef.current = false
      setStarting(false)
    }
  }

  return {
    showStart, setShowStart, workoutName, setWorkoutName, starting,
    showFinish, duration, setDuration, finishing, unfinishedChoice, setUnfinishedChoice, finishError, summary,
    openFinish, closeFinish, handleStart, handleFinish, handleDeleteWorkout, handleStartFromProgramDay,
  }
}
