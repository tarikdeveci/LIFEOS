import { useRef, useState } from 'react'
import { Alert } from 'react-native'
import { programDaySetRows, useWorkoutStore } from '@lifeos/shared'
import type { WorkoutProgram } from '@lifeos/shared'
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

  async function handleStart() {
    if (!userId || startingRef.current || !workoutName.trim()) return
    if (todayWorkout) { setShowStart(false); return }  // aynı güne ikinci antrenman açma
    startingRef.current = true
    setStarting(true)
    try {
      await startWorkout(supabase, userId, { name: workoutName.trim(), date: todayStr, status: 'in_progress' })
      setWorkoutName(''); setShowStart(false)
      await fetchHistory(supabase, userId)
    } catch { Alert.alert(t.error, t.wk_err_start) }
    finally { startingRef.current = false; setStarting(false) }
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

    const dayName = programDayLabel(day, t)
    startingRef.current = true
    setStarting(true)
    onProgramDayAccepted()  // sheet'i hemen kapat: yükleme sürerken ikinci güne basılamasın
    try {
      // Bugün için zaten bir antrenman varsa yenisini açma, setleri onun üstüne ekle.
      const workout = todayWorkout ?? await startWorkout(supabase, userId, {
        name: `${program.name} · ${dayName}`,
        date: todayStr,
        status: 'in_progress',
      })

      // Tek bir bulk insert: eskiden her set ayrı istekti (15+ round-trip)
      await addSets(supabase, workout.id, programDaySetRows(workout.id, dayExercises, Date.now()))
      await fetchHistory(supabase, userId)
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
    showFinish, setShowFinish, duration, setDuration, finishing,
    handleStart, handleFinish, handleDeleteWorkout, handleStartFromProgramDay,
  }
}
