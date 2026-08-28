'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  useWorkoutStore,
  todayDate, relativeDateLabel, shiftIsoDate,
  WORKOUT_CATEGORY_LABELS, WORKOUT_CATEGORY_COLORS,
  WORKOUT_STATUS_LABELS, WORKOUT_STATUS_COLORS,
  BODY_REGION_LABELS,
  type WorkoutCategory, type BodyRegion, type AiWorkoutPlan, type WorkoutProgram as CloudWorkoutProgram,
  type AiProgramPlan, describeAiError } from '@lifeos/shared'
import { estimateCalories } from '@lifeos/shared/supabase'
import type { Exercise, WorkoutSet } from '@lifeos/shared'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { ProGate } from '@/components/ui/ProGate'
import { useLang } from '@/lib/contexts/LangContext'

interface WorkoutViewProps { userId: string }

const BODY_REGIONS: BodyRegion[] = ['upper', 'lower', 'core', 'full']

type EquipmentType = 'all' | 'bodyweight' | 'dumbbell' | 'barbell' | 'kettlebell' | 'cable' | 'pullup_bar' | 'machine'

const DUMBBELL_PATTERN = /dumbbell|damb[iı]l|halter|goblet|arnold|zottman|tate press/i
const BARBELL_PATTERN = /barbell|close grip bench|good morning|trap bar|upright row/i
const KETTLEBELL_PATTERN = /kettlebell|turkish get up|turk(?:ish)? kalk[iı][sş][iı]|\bswing\b/i
const CABLE_PATTERN = /cable|kablo|pushdown|pallof|wood chop|crossover|face pull/i
const PULLUP_BAR_PATTERN = /barfiks|pull.?up|chin.?up|muscle.?up|front lever|inverted row/i
const MACHINE_PATTERN = /machine|makine|smith|pulldown|leg press|hack squat|pec deck|assisted|abduction|adduction|rotary torso|chest press|shoulder press|leg extension|leg curl|calf raise/i
const BARBELL_EXACT_NAMES = new Set(['bench press', 'inkline bench press', 'deadlift', 'overhead press', 'squat', 'sumo deadlift', 'barbell row', 'barbell curl'])

interface ProgramExercise { exercise_id: string; exercise_name: string; sets: number; reps: number; weight_kg: number }
interface WorkoutProgram { id: string; name: string; description: string; exercises: ProgramExercise[]; created_at: string }
interface WorkoutAssistantMessage { role: 'user' | 'assistant'; text: string }
interface WorkoutAssistantExercise {
  exercise_name: string
  sets: number
  reps: number
  weight_kg?: number
  rest_seconds?: number
  notes?: string | null
}
interface WorkoutAssistantDay { day_name: string; exercises: WorkoutAssistantExercise[] }
/**
 * Koç artık çok günlü program dönüyor (`days`). Yayındaki eski istemciler için
 * fonksiyon düz `exercises` listesini de göndermeye devam ediyor; ikisini de
 * kabul ediyoruz ki hangi tarafın önce güncellendiği önemli olmasın.
 */
interface WorkoutAssistantProgram {
  name: string
  description?: string
  split_type?: CloudWorkoutProgram['split_type']
  days?: WorkoutAssistantDay[]
  exercises?: WorkoutAssistantExercise[]
}

const COACH_SUGGESTIONS = [
  'Haftada 4 gun, kas kutlesi icin program yaz',
  'Evde sadece dambil var, 3 gunluk program',
  'Push/pull/legs programi hazirla',
  'Bel agrim var, alt vucut icin ne onerirsin?',
]

function normalizeExerciseName(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function flattenProgramDayExercises(program: CloudWorkoutProgram, dayId: string): Array<{ exercise_id: string; exercise_name: string; sets: number; reps: number; weight_kg: number }> {
  const items: Array<{ exercise_id: string; exercise_name: string; sets: number; reps: number; weight_kg: number }> = []
  const day = (program.days ?? []).find((d) => d.id === dayId)
  if (!day || day.is_rest) return items
  for (const exercise of day.exercises ?? []) {
    if (!exercise.exercise_id) continue
    items.push({
      exercise_id: exercise.exercise_id,
      exercise_name: exercise.exercise?.name ?? 'Egzersiz',
      sets: exercise.sets,
      reps: exercise.reps ?? 10,
      weight_kg: 0,
    })
  }
  return items
}

function useWorkoutPrograms(userId: string) {
  const key = `lifeos_programs_${userId}`
  const [programs, setPrograms] = useState<WorkoutProgram[]>([])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      setPrograms(JSON.parse(window.localStorage.getItem(key) ?? '[]') as WorkoutProgram[])
    } catch {
      setPrograms([])
    }
  }, [key])

  const persistPrograms = useCallback((updated: WorkoutProgram[]) => {
    setPrograms(updated)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, JSON.stringify(updated))
    }
  }, [key])

  const saveProgram = (prog: Omit<WorkoutProgram, 'id' | 'created_at'>) => {
    const newProg: WorkoutProgram = { ...prog, id: crypto.randomUUID(), created_at: new Date().toISOString() }
    const updated = [...programs, newProg]
    persistPrograms(updated)
    return newProg
  }
  const deleteProgram = (id: string) => {
    const updated = programs.filter((p) => p.id !== id)
    persistPrograms(updated)
  }
  return { programs, saveProgram, deleteProgram }
}

export function WorkoutView({ userId }: WorkoutViewProps) {
  const {
    date, muscleGroups, exercises, libraryLoading,
    todayWorkout, workoutHistory, loading,
    fetchLibrary, fetchTodayWorkout, fetchHistory,
    startWorkout, finishWorkout, skipWorkout, removeWorkout,
    addSet, updateSet, removeSet, setWorkoutAiPlan,
    programs: cloudPrograms, fetchPrograms, createProgramFromPlan,
  } = useWorkoutStore()

  const { showToast } = useToast()
  const { t, lang } = useLang()
  const { programs: localPrograms, saveProgram, deleteProgram } = useWorkoutPrograms(userId)

  const FITNESS_GOALS = [
    { value: 'muscle_gain', label: t.work_goal_muscle },
    { value: 'fat_loss',    label: t.work_goal_fat },
    { value: 'endurance',   label: t.work_goal_endurance },
    { value: 'general',     label: t.work_goal_general },
  ]

  const EQUIPMENT_LABELS: Record<EquipmentType, string> = {
    all: t.work_all_categories,
    bodyweight: 'Bodyweight', dumbbell: 'Dumbbell', barbell: 'Barbell',
    kettlebell: 'Kettlebell', cable: 'Cable', pullup_bar: 'Pull-up Bar', machine: 'Machine',
  }

  const [activeTab, setActiveTab] = useState<'today' | 'library' | 'programs' | 'history'>('today')
  const [selectedRegion, setSelectedRegion]     = useState<BodyRegion | 'all'>('all')
  const [selectedCategory, setSelectedCategory] = useState<WorkoutCategory | 'all'>('all')
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentType>('all')
  const [searchQ, setSearchQ] = useState('')

  // Program modal state
  const [showNewProgram, setShowNewProgram]           = useState(false)
  const [progName, setProgName]                       = useState('')
  const [progDesc, setProgDesc]                       = useState('')
  const [progExercises, setProgExercises]             = useState<ProgramExercise[]>([])
  const [progTab, setProgTab]                         = useState<'manual' | 'ai'>('manual')
  const [aiPrompt, setAiPrompt]                       = useState('')
  const [aiProgLoading, setAiProgLoading]             = useState(false)
  const [programChat, setProgramChat]                 = useState<WorkoutAssistantMessage[]>([])
  /** Koçun son yazdığı program taslağı — kaydedilmeyi ya da düzenlenmeyi bekliyor. */
  const [pendingProgram, setPendingProgram]           = useState<WorkoutAssistantProgram | null>(null)
  const [savingPlan, setSavingPlan]                   = useState(false)

  const [showStartModal, setShowStartModal] = useState(false)
  const [workoutName, setWorkoutName] = useState('')
  const [fitnessGoal, setFitnessGoal] = useState('general')
  const [showAddSetModal, setShowAddSetModal] = useState(false)
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null)
  const [setReps, setSetReps] = useState('10')
  const [setWeight, setSetWeight] = useState('0')
  const [setDuration, setSetDuration] = useState('')
  const [startTime, setStartTime] = useState<Date | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [showFinishModal, setShowFinishModal] = useState(false)
  const [setsExpanded, setSetsExpanded] = useState(false)
  const hasActiveWorkout = todayWorkout?.status === 'in_progress'

  const findExercise = useCallback((name: string) => {
    const target = normalizeExerciseName(name)
    return exercises.find((item) => {
      const candidate = normalizeExerciseName(item.name)
      return candidate === target || candidate.includes(target) || target.includes(candidate)
    })
  }, [exercises])

  /**
   * Koçun program taslağını kaydedilebilir plana çevirir: her hareket adı
   * kütüphanedeki gerçek egzersiz id'sine bağlanır, eşleşmeyen satır düşer.
   * Eski düz `exercises` yanıtı tek günlük program gibi ele alınır.
   */
  const toProgramPlan = useCallback((program: WorkoutAssistantProgram): AiProgramPlan | null => {
    const rawDays: WorkoutAssistantDay[] = program.days?.length
      ? program.days
      : program.exercises?.length
        ? [{ day_name: program.name || 'Gun 1', exercises: program.exercises }]
        : []

    const days = rawDays.flatMap((day) => {
      const items = day.exercises.flatMap((exercise) => {
        const match = findExercise(exercise.exercise_name)
        if (!match) return []
        return [{
          exercise_id: match.id,
          sets: exercise.sets,
          reps: exercise.reps ?? null,
          rest_seconds: exercise.rest_seconds ?? 90,
          notes: exercise.notes ?? null,
        }]
      })
      return items.length > 0 ? [{ day_name: day.day_name, exercises: items }] : []
    })

    if (days.length === 0) return null

    return {
      name: program.name,
      description: program.description,
      split_type: program.split_type,
      days,
    }
  }, [findExercise])

  const describeProgram = useCallback((program: WorkoutAssistantProgram): string => {
    const rawDays: WorkoutAssistantDay[] = program.days?.length
      ? program.days
      : program.exercises?.length
        ? [{ day_name: program.name || 'Gun 1', exercises: program.exercises }]
        : []

    return rawDays
      .map((day) => {
        const lines = day.exercises
          .map((e) => `  • ${e.exercise_name} — ${e.sets}x${e.reps}${e.rest_seconds ? ` (${e.rest_seconds}sn ara)` : ''}`)
          .join('\n')
        return `${day.day_name}\n${lines}`
      })
      .join('\n\n')
  }, [])

  /** Taslağı manuel sekmeye taşır — kullanıcı kaydetmeden önce düzenlemek isterse. */
  const applyAssistantProgram = useCallback((program: WorkoutAssistantProgram) => {
    const rawDays: WorkoutAssistantDay[] = program.days?.length
      ? program.days
      : program.exercises?.length
        ? [{ day_name: program.name || 'Gun 1', exercises: program.exercises }]
        : []

    const mappedExercises = rawDays.flatMap((day) => day.exercises.flatMap((exercise) => {
      const match = findExercise(exercise.exercise_name)
      if (!match) return []
      return [{
        exercise_id: match.id,
        exercise_name: match.name,
        sets: exercise.sets,
        reps: exercise.reps,
        weight_kg: exercise.weight_kg ?? 0,
      }]
    }))

    if (mappedExercises.length === 0) {
      showToast('AI taslagi kutuphane egzersizleri ile eslesmedi', 'error')
      return
    }

    setProgName(program.name)
    setProgDesc(program.description ?? '')
    setProgExercises(mappedExercises)
    setProgTab('manual')
    showToast('AI taslagi manuel sekmeye aktarildi', 'success')
  }, [findExercise, showToast])

  const pendingPlan: AiProgramPlan | null = pendingProgram ? toProgramPlan(pendingProgram) : null

  const handleSaveCoachProgram = useCallback(async () => {
    const plan = pendingProgram ? toProgramPlan(pendingProgram) : null
    if (!plan) return
    setSavingPlan(true)
    try {
      await createProgramFromPlan(supabase, userId, plan)
      setPendingProgram(null)
      setProgramChat([])
      setShowNewProgram(false)
      setActiveTab('programs')
      showToast(`"${plan.name}" programi kaydedildi`, 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Program kaydedilemedi', 'error')
    } finally {
      setSavingPlan(false)
    }
  }, [pendingProgram, toProgramPlan, createProgramFromPlan, userId, showToast])

  useEffect(() => {
    void fetchLibrary(supabase)
    void fetchTodayWorkout(supabase, userId)
    void fetchHistory(supabase, userId)
    void fetchPrograms(supabase, userId)
  }, [fetchLibrary, fetchTodayWorkout, fetchHistory, fetchPrograms, userId])

  // ---------- Antrenman başlat ----------
  const handleStart = useCallback(async () => {
    const workout = await startWorkout(supabase, userId, {
      date: todayDate(),
      name: workoutName.trim() || undefined,
      status: 'in_progress',
    })
    setStartTime(new Date())
    setShowStartModal(false)
    setWorkoutName('')
    showToast(`"${workout.name ?? 'Antrenman'}" basladi`, 'success')
  }, [startWorkout, userId, workoutName, showToast])

  // ---------- AI Fitness Koç ----------
  const handleAiCoach = useCallback(async () => {
    if (!todayWorkout) return
    setAiLoading(true)
    try {
      let { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        const { data: refreshData } = await supabase.auth.refreshSession()
        session = refreshData.session
      }
      if (!session) throw new Error('Oturum bulunamadı. Lütfen tekrar giriş yapın.')
      const recentSummary = workoutHistory.slice(0, 5).map((w) => ({
        date: w.date,
        name: w.name ?? 'Antrenman',
        muscle_groups: [...new Set(
          w.workout_sets?.flatMap((s) => s.exercise?.muscle_group?.name ?? []) ?? []
        )],
      }))

      const { data, error } = await supabase.functions.invoke('ai-suggest', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          type: 'workout_plan',
          date: date,
          fitness_goal: fitnessGoal,
          available_minutes: 60,
          recent_workouts: recentSummary,
          energy_level: 3,
        },
      })
      if (error) {
        throw error
      }

      const suggestions = (data as { suggestions?: AiWorkoutPlan[] }).suggestions
      if (Array.isArray(suggestions) && suggestions.length > 0) {
        await setWorkoutAiPlan(supabase, todayWorkout.id, suggestions)
        showToast('AI antrenman plani guncellendi', 'success')
      }
    } catch (err) {
      const info = await describeAiError(err, lang)
      if (info.detail) console.error('ai-suggest workout_plan:', info.status, info.detail)
      showToast(info.message, 'error')
    } finally {
      setAiLoading(false)
    }
  }, [todayWorkout, workoutHistory, date, fitnessGoal, lang, setWorkoutAiPlan, showToast])

  const handleAiProgramAssistant = useCallback(async (preset?: string) => {
    const prompt = (preset ?? aiPrompt).trim()
    if (!prompt || aiProgLoading) return

    // Gecmis sunucuya gonderilmezse her mesaj sifirdan basliyor ve
    // "carsambayi da ekle" gibi bir duzeltme baglamsiz kaliyor.
    const history = programChat.slice(-8)

    setAiProgLoading(true)
    setProgramChat((current) => [...current, { role: 'user', text: prompt }])
    setAiPrompt('')

    try {
      let { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        const { data: refreshData } = await supabase.auth.refreshSession()
        session = refreshData.session
      }
      if (!session) throw new Error('Oturum bulunamadi')

      const { data, error } = await supabase.functions.invoke('ai-suggest', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          type: 'workout_program_chat',
          user_message: prompt,
          workout_context: {
            history,
            available_exercises: exercises.map((exercise) => ({
              name: exercise.name,
              category: exercise.category,
              muscle_group: exercise.muscle_group?.name,
              is_bodyweight: exercise.is_bodyweight,
            })),
          },
        },
      })

      if (error) throw error

      const result = data as { message?: string; program?: WorkoutAssistantProgram | null }
      const baseText = result.message?.trim() || 'Bir program taslagi hazirlandi.'
      const program = result.program ?? null
      const plan = program ? toProgramPlan(program) : null

      if (program && !plan) {
        showToast('AI taslagi kutuphane egzersizleri ile eslesmedi', 'error')
      }

      const assistantText = program
        ? `${baseText}\n\n${program.name}\n${describeProgram(program)}`
        : baseText

      setProgramChat((current) => [...current, { role: 'assistant', text: assistantText }])
      setPendingProgram(plan ? program : null)
    } catch (err) {
      const info = await describeAiError(err, lang)
      if (info.detail) console.error('ai-suggest workout_program_chat:', info.status, info.detail)
      setProgramChat((current) => [...current, { role: 'assistant', text: info.message }])
      showToast(info.message, 'error')
    } finally {
      setAiProgLoading(false)
    }
  }, [aiPrompt, aiProgLoading, describeProgram, exercises, lang, programChat, showToast, toProgramPlan])

  // ---------- Set ekle ----------
  const handleAddSet = useCallback(async () => {
    if (!todayWorkout || !selectedExercise) return
    const existingSets = todayWorkout.workout_sets?.filter(
      (s) => s.exercise_id === selectedExercise.id
    ).length ?? 0

    await addSet(supabase, {
      workout_id: todayWorkout.id,
      exercise_id: selectedExercise.id,
      set_number: existingSets + 1,
      reps: setReps ? parseInt(setReps) : undefined,
      weight_kg: setWeight ? parseFloat(setWeight) : undefined,
      duration_seconds: setDuration ? parseInt(setDuration) : undefined,
    })
    showToast(`${selectedExercise.name} seti eklendi`, 'success')
    setShowAddSetModal(false)
    setSetReps('10'); setSetWeight('0'); setSetDuration('')
  }, [todayWorkout, selectedExercise, setReps, setWeight, setDuration, addSet, showToast])

  // ---------- Antrenmanı bitir ----------
  const handleFinish = useCallback(async () => {
    if (!todayWorkout) return
    const durationMin = startTime
      ? Math.round((Date.now() - startTime.getTime()) / 60000)
      : (todayWorkout.duration_minutes ?? 60)

    // MET tabanlı kalori tahmini (varsayılan 75kg, ortalama MET 5)
    const avgMet = todayWorkout.workout_sets?.reduce((sum, s) => {
      const met = s.exercise?.met_value ?? 5
      return sum + met
    }, 0) ?? 0
    const setCount = todayWorkout.workout_sets?.length ?? 1
    const meanMet = setCount > 0 ? avgMet / setCount : 5
    const estimatedCal = estimateCalories(meanMet, 75, durationMin)

    await finishWorkout(supabase, todayWorkout.id, durationMin, estimatedCal > 0 ? estimatedCal : undefined)

    setShowFinishModal(false)
    showToast(`Antrenman tamamlandı! ${durationMin} dk · ~${estimatedCal} kcal 🎉`, 'success')
  }, [todayWorkout, startTime, finishWorkout, showToast])

  // ---------- Programdan başlat ----------
  const handleStartFromProgram = useCallback(async (prog: WorkoutProgram) => {
    const workout = await startWorkout(supabase, userId, { date: todayDate(), name: prog.name, status: 'in_progress' })
    for (const pe of prog.exercises) {
      for (let s = 1; s <= pe.sets; s++) {
        await addSet(supabase, { workout_id: workout.id, exercise_id: pe.exercise_id, set_number: s, reps: pe.reps, weight_kg: pe.weight_kg > 0 ? pe.weight_kg : undefined })
      }
    }
    setStartTime(new Date())
    setActiveTab('today')
    showToast(`"${prog.name}" programindan antrenman basladi`, 'success')
  }, [startWorkout, addSet, userId, showToast])

  const handleStartFromCloudProgramDay = useCallback(async (prog: CloudWorkoutProgram, dayId: string) => {
    const day = (prog.days ?? []).find((d) => d.id === dayId)
    if (!day || day.is_rest) return
    const flattened = flattenProgramDayExercises(prog, dayId)
    const dayName = day.day_name?.trim() || `Gun ${day.day_number}`
    const workout = await startWorkout(supabase, userId, { date: todayDate(), name: `${prog.name} · ${dayName}`, status: 'in_progress' })
    for (const pe of flattened) {
      for (let s = 1; s <= pe.sets; s++) {
        await addSet(supabase, { workout_id: workout.id, exercise_id: pe.exercise_id, set_number: s, reps: pe.reps, weight_kg: pe.weight_kg > 0 ? pe.weight_kg : undefined })
      }
    }
    setStartTime(new Date())
    setActiveTab('today')
    showToast(`"${prog.name}" programindan antrenman basladi`, 'success')
  }, [startWorkout, addSet, userId, showToast])

  // ---------- Filtrelenmiş egzersizler ----------
  const filteredExercises = exercises.filter((ex) => {
    const normalizedName = normalizeExerciseName(ex.name)
    if (selectedCategory !== 'all' && ex.category !== selectedCategory) return false
    if (selectedRegion !== 'all') {
      const mg = muscleGroups.find((m) => m.id === ex.muscle_group_id)
      if (!mg || mg.body_region !== selectedRegion) return false
    }
    if (selectedEquipment === 'bodyweight' && !ex.is_bodyweight) return false
    if (selectedEquipment === 'dumbbell' && !DUMBBELL_PATTERN.test(ex.name)) return false
    if (selectedEquipment === 'barbell' && !BARBELL_PATTERN.test(ex.name) && !BARBELL_EXACT_NAMES.has(normalizedName)) return false
    if (selectedEquipment === 'kettlebell' && !KETTLEBELL_PATTERN.test(ex.name)) return false
    if (selectedEquipment === 'cable' && !CABLE_PATTERN.test(ex.name)) return false
    if (selectedEquipment === 'pullup_bar' && !PULLUP_BAR_PATTERN.test(ex.name)) return false
    if (selectedEquipment === 'machine' && !MACHINE_PATTERN.test(ex.name)) return false
    if (searchQ && !ex.name.toLowerCase().includes(searchQ.toLowerCase())) return false
    return true
  })

  const todayLabel = relativeDateLabel(todayDate())
  const completedSets = todayWorkout?.workout_sets?.filter((s) => s.completed).length ?? 0
  const totalSets = todayWorkout?.workout_sets?.length ?? 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">{t.work_title}</h1>
          <p className="text-sm text-muted">{todayLabel}</p>
        </div>
        <div className="flex gap-2">
          {!hasActiveWorkout && (localPrograms.length > 0 || cloudPrograms.length > 0) && (
            <Button variant="outline" size="sm" onClick={() => setActiveTab('programs')}>{t.work_start_program}</Button>
          )}
          {!hasActiveWorkout && (
            <Button onClick={() => setShowStartModal(true)} size="sm">
              {t.work_new}
            </Button>
          )}
          {hasActiveWorkout && (
            <Button variant="danger" size="sm" onClick={() => setShowFinishModal(true)}>
              {t.work_finish}
            </Button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex rounded-xl border border-border/60 bg-surface p-1">
        {(['today', 'library', 'programs', 'history'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${activeTab === tab ? 'bg-accent text-white' : 'text-muted hover:text-primary'}`}>
            {tab === 'today' ? t.work_tab_today : tab === 'library' ? t.work_tab_exercises : tab === 'programs' ? t.work_tab_programs : t.work_tab_history}
          </button>
        ))}
      </div>

      {/* ========== BUGÜN TAB ========== */}
      {activeTab === 'today' && (
        <div className="grid grid-cols-12 gap-4">
          {/* Sol — Aktif antrenman */}
          <div className="col-span-8 space-y-4">
            {!todayWorkout ? (
              <div className="rounded-2xl border border-dashed border-border py-16 text-center">
                <p className="mt-3 font-medium text-primary">{t.work_no_workout}</p>
                <p className="mt-1 text-sm text-muted">{t.work_no_workout_hint}</p>
                <Button className="mt-4" onClick={() => setShowStartModal(true)}>
                  {t.work_start}
                </Button>
              </div>
            ) : (
              <>
                {/* Antrenman header */}
                <div className="glass rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-bold text-primary">
                        {todayWorkout.name ?? 'Antrenman'}
                      </h2>
                      <span
                        className="mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: WORKOUT_STATUS_COLORS[todayWorkout.status] + '22',
                          color: WORKOUT_STATUS_COLORS[todayWorkout.status],
                        }}
                      >
                        {WORKOUT_STATUS_LABELS[todayWorkout.status]}
                      </span>
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-semibold text-primary">{completedSets}/{totalSets}</p>
                      <p className="text-xs text-muted">{t.work_sets_done}</p>
                    </div>
                  </div>

                  {totalSets > 0 && (
                    <div className="mt-3 h-2 rounded-full bg-border/40">
                      <div
                        className="h-2 rounded-full bg-success transition-all"
                        style={{ width: `${(completedSets / totalSets) * 100}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Set listesi — in_progress: always visible; completed: collapsible */}
                {todayWorkout.workout_sets && todayWorkout.workout_sets.length > 0 && (
                  <div className="glass rounded-2xl p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="font-semibold text-primary">{t.work_sets_title}</h3>
                      {todayWorkout.status === 'completed' && (
                        <button
                          onClick={() => setSetsExpanded((v) => !v)}
                          className="text-xs text-muted hover:text-primary transition-colors"
                        >
                          {setsExpanded ? '▲ Gizle' : `▼ ${t.work_sets_title} (${todayWorkout.workout_sets.length})`}
                        </button>
                      )}
                    </div>
                    {(todayWorkout.status !== 'completed' || setsExpanded) && (
                      <div className="space-y-2">
                        {todayWorkout.workout_sets.map((set) => (
                          <SetRow
                            key={set.id}
                            set={set}
                            onToggle={todayWorkout.status === 'in_progress' ? () => void updateSet(supabase, set.id, { completed: !set.completed }) : undefined}
                            onDelete={todayWorkout.status === 'in_progress' ? () => void removeSet(supabase, set.id) : undefined}
                          />
                        ))}
                      </div>
                    )}
                    {todayWorkout.status === 'in_progress' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 w-full"
                        onClick={() => setShowAddSetModal(true)}
                      >
                        {t.work_add_set}
                      </Button>
                    )}
                  </div>
                )}

                {todayWorkout.status === 'in_progress' && totalSets === 0 && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowAddSetModal(true)}
                  >
                    {t.work_add_first_set}
                  </Button>
                )}
              </>
            )}
          </div>

          {/* Sağ — AI Koç + Stats */}
          <div className="col-span-4 space-y-4">
            {/* Hedef seçimi */}
            <div className="glass rounded-2xl p-4">
              <h3 className="mb-2 text-sm font-semibold text-primary">{t.work_fitness_goal}</h3>
              <div className="space-y-1">
                {FITNESS_GOALS.map((g) => (
                  <button
                    key={g.value}
                    onClick={() => setFitnessGoal(g.value)}
                    className={`w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium transition-colors ${
                      fitnessGoal === g.value
                        ? 'bg-accent/10 text-accent'
                        : 'text-muted hover:bg-background'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* AI Koç */}
            <div className="glass rounded-2xl p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-primary">{t.work_ai_coach}</h3>
                <button
                  onClick={() => void handleAiCoach()}
                  disabled={aiLoading || !todayWorkout}
                  className="rounded-lg bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent hover:bg-accent/20 disabled:opacity-40"
                >
                  {aiLoading ? t.work_loading : t.work_analyze}
                </button>
              </div>
              <ProGate featureName="AI Antrenman Koçu">

              {!todayWorkout ? (
                <p className="text-xs text-muted">{t.work_start_first}</p>
              ) : !todayWorkout.ai_plan?.length ? (
                <p className="text-xs text-muted">
                  {t.work_get_plan}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {todayWorkout.ai_plan.map((tip, i) => (
                    <AiTipItem key={i} tip={tip} />
                  ))}
                </ul>
              )}
              </ProGate>
            </div>

            {/* Haftalık özet */}
            {workoutHistory.length > 0 && (
              <div className="glass rounded-2xl p-4">
                <h3 className="mb-3 text-sm font-semibold text-primary">{t.work_last_7}</h3>
                <WeeklyStreak history={workoutHistory} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========== KÜTÜPHANESİ TAB ========== */}
      {activeTab === 'library' && (
        <div className="space-y-4">
          {/* Filtreler */}
          <div className="flex flex-wrap gap-2">
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder={t.work_search_exercise}
              className="rounded-xl border border-border px-3 py-2 text-sm text-primary outline-none focus:border-accent"
            />
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value as BodyRegion | 'all')}
              className="rounded-xl border border-border px-3 py-2 text-sm text-primary"
            >
              <option value="all">{t.work_all_regions}</option>
              {BODY_REGIONS.map((r) => (
                <option key={r} value={r}>{BODY_REGION_LABELS[r]}</option>
              ))}
            </select>
            <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value as WorkoutCategory | 'all')}
              className="rounded-xl border border-border px-3 py-2 text-sm text-primary">
              <option value="all">{t.work_all_categories}</option>
              {(Object.keys(WORKOUT_CATEGORY_LABELS) as WorkoutCategory[]).map((c) => (
                <option key={c} value={c}>{WORKOUT_CATEGORY_LABELS[c]}</option>
              ))}
            </select>
            <select value={selectedEquipment} onChange={(e) => setSelectedEquipment(e.target.value as EquipmentType)}
              className="rounded-xl border border-border px-3 py-2 text-sm text-primary">
              {(Object.keys(EQUIPMENT_LABELS) as EquipmentType[]).map((eq) => (
                <option key={eq} value={eq}>{EQUIPMENT_LABELS[eq]}</option>
              ))}
            </select>
          </div>

          {libraryLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filteredExercises.map((ex) => (
                <ExerciseCard
                  key={ex.id}
                  exercise={ex}
                  onSelect={
                    todayWorkout?.status === 'in_progress'
                      ? () => {
                          setSelectedExercise(ex)
                          setShowAddSetModal(true)
                        }
                      : undefined
                  }
                />
              ))}
              {filteredExercises.length === 0 && (
                <p className="col-span-3 py-8 text-center text-muted">{t.work_no_exercises}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========== GEÇMİŞ TAB ========== */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          {workoutHistory.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border py-12 text-center">
              <p className="text-muted">Henüz tamamlanmış antrenman yok</p>
            </div>
          ) : (
            workoutHistory.map((w) => (
              <div key={w.id} className="glass rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-primary">{w.name ?? 'Antrenman'}</p>
                    <p className="text-xs text-muted">{w.date}</p>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    {w.duration_minutes && (
                      <span className="text-xs text-muted">{w.duration_minutes} dk</span>
                    )}
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: WORKOUT_STATUS_COLORS[w.status] + '22',
                        color: WORKOUT_STATUS_COLORS[w.status],
                      }}
                    >
                      {WORKOUT_STATUS_LABELS[w.status]}
                    </span>
                    <button
                      onClick={() => void removeWorkout(supabase, w.id)}
                      className="text-xs text-danger hover:underline"
                    >
                      Sil
                    </button>
                  </div>
                </div>
                {w.workout_sets && w.workout_sets.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {[...new Set(w.workout_sets.map((s) => s.exercise?.muscle_group?.name))].filter(Boolean).map((mg) => (
                      <span key={mg} className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent">
                        {mg}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ========== PROGRAMLAR TAB ========== */}
      {activeTab === 'programs' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted">{t.work_saved_programs}</p>
            <Button size="sm" onClick={() => { setProgName(''); setProgDesc(''); setProgExercises([]); setProgramChat([]); setProgTab('manual'); setShowNewProgram(true) }}>{t.work_new_program}</Button>
          </div>
          {localPrograms.length === 0 && cloudPrograms.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border py-16 text-center">
              <p className="mt-3 font-medium text-primary">{t.work_no_programs}</p>
              <p className="mt-1 text-sm text-muted">{t.work_no_programs_hint}</p>
              <Button className="mt-4" onClick={() => { setProgName(''); setProgDesc(''); setProgExercises([]); setProgramChat([]); setProgTab('manual'); setShowNewProgram(true) }}>{t.work_create_program}</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {cloudPrograms.map((prog) => {
                const activeDays = (prog.days ?? []).filter((d) => !d.is_rest)
                return (
                <div key={prog.id} className="glass rounded-2xl p-4">
                  <div className="flex items-start justify-between">
                    <div><h3 className="font-semibold text-primary">{prog.name}</h3>{prog.description && <p className="mt-0.5 text-xs text-muted">{prog.description}</p>}</div>
                    {prog.user_id === null ? <span className="text-[10px] text-accent">Template</span> : null}
                  </div>
                  <div className="mt-3 space-y-1">
                    {activeDays.slice(0, 4).map((day) => (
                      <button
                        key={day.id}
                        onClick={() => void handleStartFromCloudProgramDay(prog, day.id)}
                        disabled={hasActiveWorkout}
                        className="flex w-full items-center justify-between rounded-lg border border-border/50 px-2 py-1.5 text-left hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="text-xs font-medium text-primary">{day.day_name || `Gun ${day.day_number}`}</span>
                        <span className="text-[10px] text-muted">{day.exercises?.length ?? 0} egzersiz</span>
                      </button>
                    ))}
                    {activeDays.length === 0 ? <p className="text-xs text-muted">Program günü bulunamadı</p> : null}
                    {activeDays.length > 4 ? <p className="text-xs text-muted">+{activeDays.length - 4} gun</p> : null}
                  </div>
                  <Button size="sm" className="mt-4 w-full" onClick={() => setActiveTab('today')} disabled={hasActiveWorkout}>
                    {hasActiveWorkout ? 'Antrenman devam ediyor' : 'Günlerden birini seç'}
                  </Button>
                </div>
                )
              })}
              {localPrograms.map((prog) => (
                <div key={prog.id} className="glass rounded-2xl p-4">
                  <div className="flex items-start justify-between">
                    <div><h3 className="font-semibold text-primary">{prog.name}</h3>{prog.description && <p className="mt-0.5 text-xs text-muted">{prog.description}</p>}</div>
                    <button onClick={() => deleteProgram(prog.id)} className="text-xs text-danger hover:underline">Sil</button>
                  </div>
                  <div className="mt-3 space-y-1">
                    {prog.exercises.map((pe, i) => (
                      <div key={`${prog.id}-${i}`} className="flex items-center gap-2 text-xs text-muted">
                        <span className="font-medium text-primary">{pe.exercise_name}</span>
                        <span>{pe.sets}x{pe.reps}{pe.weight_kg > 0 ? ` · ${pe.weight_kg}kg` : ''}</span>
                      </div>
                    ))}
                  </div>
                  <Button size="sm" className="mt-4 w-full" onClick={() => void handleStartFromProgram(prog)} disabled={hasActiveWorkout}>
                    {hasActiveWorkout ? 'Antrenman devam ediyor' : 'Bu Programla Baslat'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========== MODALS ========== */}

      {/* Antrenman başlat */}
      <Modal open={showStartModal} onClose={() => setShowStartModal(false)} title={t.work_start_modal} size="sm">
        <div className="space-y-4">
          <Input
            label={t.work_name_optional}
            value={workoutName}
            onChange={(e) => setWorkoutName(e.target.value)}
            placeholder={t.work_name_placeholder}
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-primary">{t.work_fitness_goal_label}</label>
            <div className="grid grid-cols-2 gap-2">
              {FITNESS_GOALS.map((g) => (
                <button
                  key={g.value}
                  onClick={() => setFitnessGoal(g.value)}
                  className={`rounded-xl border py-2 text-sm font-medium transition-colors ${
                    fitnessGoal === g.value
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-muted hover:border-accent/50'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowStartModal(false)}>{t.work_cancel}</Button>
            <Button size="sm" onClick={() => void handleStart()}>{t.work_start_btn}</Button>
          </div>
        </div>
      </Modal>

      {/* Set ekle */}
      <Modal
        open={showAddSetModal}
        onClose={() => { setShowAddSetModal(false); setSelectedExercise(null) }}
        title={selectedExercise ? `${selectedExercise.name} — Set Ekle` : 'Set Ekle'}
        size="sm"
      >
        <div className="space-y-4">
          {/* Egzersiz seçimi (modal kütüphaneden açılmadıysa) */}
          {!selectedExercise && (
            <div>
              <label className="mb-1 block text-sm font-medium text-primary">Egzersiz Seç</label>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {exercises.map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => setSelectedExercise(ex)}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-primary hover:bg-background"
                  >
                    {ex.name}
                    <span className="ml-2 text-xs text-muted">
                      {ex.muscle_group?.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedExercise && (
            <>
              <div className="rounded-lg bg-accent/5 px-3 py-2 text-sm">
                <span className="font-medium text-accent">{selectedExercise.name}</span>
                <span className="ml-2 text-xs text-muted">
                  {selectedExercise.muscle_group?.name} · {WORKOUT_CATEGORY_LABELS[selectedExercise.category]}
                </span>
              </div>
              {selectedExercise.instructions && (
                <p className="rounded-lg bg-background px-3 py-2 text-xs text-muted">
                  {selectedExercise.instructions}
                </p>
              )}
              <div className="grid grid-cols-3 gap-3">
                <Input
                  label="Tekrar"
                  type="number"
                  value={setReps}
                  onChange={(e) => setSetReps(e.target.value)}
                  placeholder="10"
                />
                <Input
                  label={selectedExercise.is_bodyweight ? 'Ekstra kg' : 'Ağırlık (kg)'}
                  type="number"
                  value={setWeight}
                  onChange={(e) => setSetWeight(e.target.value)}
                  placeholder="0"
                />
                <Input
                  label="Süre (sn)"
                  type="number"
                  value={setDuration}
                  onChange={(e) => setSetDuration(e.target.value)}
                  placeholder="—"
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setShowAddSetModal(false); setSelectedExercise(null) }}>
              {t.work_cancel}
            </Button>
            <Button size="sm" onClick={() => void handleAddSet()} disabled={!selectedExercise}>
              Ekle
            </Button>
          </div>
        </div>
      </Modal>

      {/* Antrenmanı bitir */}
      <Modal open={showFinishModal} onClose={() => setShowFinishModal(false)} title={t.work_finish_title} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {completedSets}/{totalSets} set tamamlandı.
            {startTime && (
              <> Geçen süre: <span className="font-medium text-primary">
                {Math.round((Date.now() - startTime.getTime()) / 60000)} dakika
              </span></>
            )}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => {
              if (todayWorkout) void skipWorkout(supabase, todayWorkout.id)
              setShowFinishModal(false)
            }}>
              {t.work_skip}
            </Button>
            <Button size="sm" onClick={() => void handleFinish()}>
              {t.work_finish_btn}
            </Button>
          </div>
        </div>
      </Modal>
      {/* Yeni Program */}
      <Modal open={showNewProgram} onClose={() => setShowNewProgram(false)} title={t.work_new_program_title} size="lg">
        <div className="space-y-4">
          <div className="flex rounded-xl border border-border/60 bg-background p-1">
            {(['manual', 'ai'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setProgTab(tab)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${progTab === tab ? 'bg-surface text-primary shadow-sm' : 'text-muted'}`}
              >
                {tab === 'manual' ? t.work_manual : t.work_ai_assistant}
              </button>
            ))}
          </div>

          {progTab === 'ai' ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                <p className="text-sm font-medium text-primary">Antrenman Kocu</p>
                <p className="mt-1 text-xs text-muted">
                  Hedefini, ekipmanini ve haftalik frekansini yaz; koc kutuphanedeki hareketlerle
                  haftalik program yazsin. Sohbeti surdurerek programi degistirebilirsin.
                </p>
              </div>

              {programChat.length === 0 ? (
                <div className="flex flex-wrap gap-2">
                  {COACH_SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => void handleAiProgramAssistant(suggestion)}
                      className="rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent hover:text-primary"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-border/60 bg-surface p-3">
                  {programChat.map((message, index) => (
                    <div key={`${message.role}-${index}`} className={`whitespace-pre-line rounded-2xl px-3 py-2 text-sm ${message.role === 'user' ? 'ml-10 bg-accent text-white' : 'mr-10 bg-background text-primary'}`}>
                      {message.text}
                    </div>
                  ))}
                  {aiProgLoading && (
                    <div className="mr-10 rounded-2xl bg-background px-3 py-2 text-sm text-muted">Yaziyor...</div>
                  )}
                </div>
              )}

              {pendingPlan && (
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-accent/40 bg-accent/5 p-3">
                  <p className="flex-1 text-xs text-muted">
                    <span className="font-medium text-primary">{pendingPlan.name}</span>
                    {' · '}{pendingPlan.days.length} gun · {pendingPlan.days.reduce((sum, d) => sum + d.exercises.length, 0)} hareket
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => pendingProgram && applyAssistantProgram(pendingProgram)}>
                    Duzenle
                  </Button>
                  <Button size="sm" loading={savingPlan} onClick={() => void handleSaveCoachProgram()}>
                    Programi kaydet
                  </Button>
                </div>
              )}

              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void handleAiProgramAssistant()
                  }
                }}
                placeholder={t.work_ai_placeholder}
                className="min-h-[80px] w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-primary outline-none placeholder:text-muted/50 focus:border-accent focus:bg-surface"
              />

              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setProgramChat([]); setPendingProgram(null) }}>{t.work_clear}</Button>
                <Button size="sm" onClick={() => void handleAiProgramAssistant()} loading={aiProgLoading} disabled={!aiPrompt.trim()}>
                  {t.work_generate}
                </Button>
              </div>
            </div>
          ) : (
            <>
          <Input label={t.work_program_name} value={progName} onChange={(e) => setProgName(e.target.value)} placeholder="Push Day, Ust Vucut A..." />
          <Input label={t.work_program_desc} value={progDesc} onChange={(e) => setProgDesc(e.target.value)} placeholder="Pazartesi, Carsamba, Cuma" />
          {progExercises.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-primary">{t.work_exercises}</p>
              {progExercises.map((pe, i) => (
                <div key={i} className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2">
                  <span className="flex-1 text-sm font-medium text-primary">{pe.exercise_name}</span>
                  <input type="number" value={pe.sets} onChange={(e) => setProgExercises((p) => p.map((x, xi) => xi === i ? { ...x, sets: parseInt(e.target.value) || 3 } : x))} className="w-12 rounded border border-border px-1 py-0.5 text-center text-xs" title="Set" />
                  <span className="text-xs text-muted">{t.work_sets}</span>
                  <input type="number" value={pe.reps} onChange={(e) => setProgExercises((p) => p.map((x, xi) => xi === i ? { ...x, reps: parseInt(e.target.value) || 10 } : x))} className="w-12 rounded border border-border px-1 py-0.5 text-center text-xs" title="Tekrar" />
                  <span className="text-xs text-muted">{t.work_reps}</span>
                  <input type="number" value={pe.weight_kg} onChange={(e) => setProgExercises((p) => p.map((x, xi) => xi === i ? { ...x, weight_kg: parseFloat(e.target.value) || 0 } : x))} className="w-14 rounded border border-border px-1 py-0.5 text-center text-xs" title="Ağırlık" />
                  <span className="text-xs text-muted">{t.work_kg}</span>
                  <button onClick={() => setProgExercises((p) => p.filter((_, xi) => xi !== i))} className="text-xs text-danger">✕</button>
                </div>
              ))}
            </div>
          )}
          <div>
            <p className="mb-2 text-xs font-medium text-muted">{t.work_add_exercise}</p>
            <div className="max-h-40 overflow-y-auto space-y-0.5 rounded-xl border border-border/60">
              {exercises.map((ex) => (
                <button key={ex.id} onClick={() => setProgExercises((p) => [...p, { exercise_id: ex.id, exercise_name: ex.name, sets: 3, reps: 10, weight_kg: 0 }])}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-background">
                  <span className="flex-1 font-medium text-primary">{ex.name}</span>
                  <span className="text-xs text-muted">{ex.muscle_group?.name}</span>
                  <span className="text-accent">+</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowNewProgram(false)}>{t.work_cancel}</Button>
            <Button size="sm" disabled={!progName.trim() || progExercises.length === 0}
              onClick={() => { saveProgram({ name: progName.trim(), description: progDesc, exercises: progExercises }); setShowNewProgram(false); showToast(`"${progName}" programi kaydedildi`, 'success') }}>
              {t.work_save_program}
            </Button>
          </div>
            </>
          )}
        </div>
      </Modal>

    </div>
  )
}

// -------------------------------------------------------
// Alt bileşenler
// -------------------------------------------------------

function SetRow({ set, onToggle, onDelete }: {
  set: WorkoutSet
  onToggle?: () => void
  onDelete?: () => void
}) {
  const color = WORKOUT_CATEGORY_COLORS[set.exercise?.category ?? 'strength']
  return (
    <div className={`flex items-center gap-3 rounded-xl px-3 py-2 ${set.completed ? 'bg-success/5' : 'bg-background'}`}>
      {onToggle ? (
        <button
          onClick={onToggle}
          className={`h-5 w-5 rounded-full border-2 transition-colors ${
            set.completed ? 'border-success bg-success' : 'border-border'
          }`}
        />
      ) : (
        <div className={`h-5 w-5 rounded-full border-2 ${set.completed ? 'border-success bg-success' : 'border-border/40'}`} />
      )}
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium text-primary">
          {set.exercise?.name ?? '—'}
          <span className="ml-2 text-xs font-normal text-muted">Set {set.set_number}</span>
        </p>
        <p className="text-xs text-muted">
          {set.reps ? `${set.reps} tekrar` : ''}
          {set.weight_kg ? ` · ${set.weight_kg}kg` : ''}
          {set.duration_seconds ? ` · ${set.duration_seconds}sn` : ''}
        </p>
      </div>
      <span
        className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
        style={{ backgroundColor: color + '22', color }}
      >
        {set.exercise?.muscle_group?.name ?? '—'}
      </span>
      {onDelete && (
        <button onClick={onDelete} className="shrink-0 text-xs text-danger hover:underline">
          ×
        </button>
      )}
    </div>
  )
}

function ExerciseCard({ exercise, onSelect }: {
  exercise: Exercise
  onSelect?: () => void
}) {
  const color = WORKOUT_CATEGORY_COLORS[exercise.category]
  return (
    <div
      onClick={onSelect}
      className={`glass rounded-2xl p-4 transition-shadow ${
        onSelect ? 'cursor-pointer hover:shadow-md' : ''
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="font-semibold text-primary text-sm leading-tight">{exercise.name}</p>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ backgroundColor: color + '22', color }}
        >
          {WORKOUT_CATEGORY_LABELS[exercise.category]}
        </span>
      </div>
      {exercise.muscle_group && (
        <p className="text-xs text-muted">{exercise.muscle_group.name}</p>
      )}
      {exercise.instructions && (
        <p className="mt-2 line-clamp-2 text-[11px] text-muted">{exercise.instructions}</p>
      )}
      {onSelect && (
        <p className="mt-2 text-xs font-medium text-accent">+ Set ekle →</p>
      )}
    </div>
  )
}

function AiTipItem({ tip }: { tip: AiWorkoutPlan }) {
  const labels: Record<AiWorkoutPlan['type'], string> = {
    exercise_suggestion: 'Egzersiz',
    rest:                'Dinlenme',
    progression:         'Ilerleme',
    general:             'Genel',
  }
  return (
    <li className="flex gap-2 rounded-lg bg-background px-3 py-2 text-xs">
      <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">{labels[tip.type] ?? 'Not'}</span>
      <span className="text-muted">{tip.message}</span>
    </li>
  )
}

function WeeklyStreak({ history }: { history: { date: string; status: string }[] }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const dateStr = d.toISOString().split('T')[0]!
    const w = history.find((h) => h.date === dateStr)
    return { dateStr, status: w?.status ?? null, label: d.toLocaleDateString('tr-TR', { weekday: 'short' }) }
  })

  return (
    <div className="flex justify-between">
      {days.map((d) => (
        <div key={d.dateStr} className="flex flex-col items-center gap-1">
          <div
            className="h-8 w-8 rounded-full"
            style={{
              backgroundColor: d.status === 'completed'
                ? '#34A853'
                : d.status === 'skipped'
                  ? '#EF444444'
                  : '#F3F4F6',
            }}
            title={d.status ?? 'Antrenman yok'}
          />
          <span className="text-[9px] text-muted">{d.label}</span>
        </div>
      ))}
    </div>
  )
}
