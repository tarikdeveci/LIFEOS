import { useEffect, useState, useCallback } from 'react'
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { supabase } from '@/src/lib/supabase'
import { callAiSuggest } from '@/src/lib/ai'
import { useWorkoutStore } from '@lifeos/shared'
import type { Exercise, WorkoutSet, WorkoutProgram, AiProgramPlan } from '@lifeos/shared'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Input } from '@/src/components/ui/Input'
import { Button } from '@/src/components/ui/Button'
import { StatCard } from '@/src/components/ui/StatCard'
import { BottomSheet } from '@/src/components/ui/BottomSheet'
import { AiChatSheet, type AiChatMessage } from '@/src/components/ai/AiChatSheet'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { useBottomTabPadding } from '@/src/hooks/useBottomTabPadding'
import { useProGate } from '@/src/hooks/useProGate'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

type WorkoutTab = 'today' | 'library' | 'programs' | 'history'

const CATEGORY_LABELS: Record<string, string> = {
  strength: 'Kuvvet', cardio: 'Kardiyo', flexibility: 'Esneklik', mobility: 'Hareketlilik',
}

const HISTORY_STATUS: Record<string, { label: string; color: string }> = {
  completed:   { label: '✓ Tamam',    color: palette.success },
  in_progress: { label: '● Devam',    color: palette.workout },
  planned:     { label: 'Planlandı',  color: palette.accent },
  skipped:     { label: 'Atlandı',    color: palette.warning },
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

const COACH_SUGGESTIONS = [
  'Bana haftalık program yaz',
  'Haftada 3 gün, kas kazanmak istiyorum',
  'Bugün ne çalışmalıyım?',
  'Kalça ve bacak odaklı program',
]

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
  const { t } = useLang()
  const bottomPadding = useBottomTabPadding()
  const { exercises, muscleGroups, todayWorkout, workoutHistory, programs, fetchLibrary, fetchTodayWorkout, fetchHistory, fetchPrograms, startWorkout, finishWorkout, removeWorkout, addSet, addSets, removeSet, createProgramWithDays, createProgramFromPlan, addExerciseToDay, removeExerciseFromDay, deleteProgram } = useWorkoutStore()
  const [userId, setUserId] = useState<string | null>(null)
  const { isPro, isCheckingPro, requirePro } = useProGate(userId)
  const [tab, setTab] = useState<WorkoutTab>('today')
  const [refreshing, setRefreshing] = useState(false)
  const [setsExpanded, setSetsExpanded] = useState(false)

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
  const [newDayNames, setNewDayNames] = useState<string[]>(['Gün 1', 'Gün 2', 'Gün 3'])
  const [savingProgram, setSavingProgram] = useState(false)
  /** Hangi güne hareket ekleniyor — egzersiz seçicisini açar */
  const [addingToDay, setAddingToDay] = useState<string | null>(null)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerSets, setPickerSets] = useState('3')
  const [pickerReps, setPickerReps] = useState('10')

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

  const todayStr = new Date().toISOString().split('T')[0] ?? ''

  const load = useCallback(async (uid: string) => {
    await Promise.all([fetchLibrary(supabase), fetchTodayWorkout(supabase, uid, todayStr), fetchHistory(supabase, uid), fetchPrograms(supabase, uid)])
  }, [todayStr, fetchLibrary, fetchTodayWorkout, fetchHistory, fetchPrograms])

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
    } catch { Alert.alert('Hata', 'Antrenman başlatılamadı') }
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
    } catch { Alert.alert('Hata', 'Set eklenemedi') }
    finally { setAddingSet(false) }
  }

  async function handleFinish() {
    if (!todayWorkout || finishing) return
    setFinishing(true)
    try {
      await finishWorkout(supabase, todayWorkout.id, parseInt(duration) || 45)
      setShowFinish(false); setDuration('')
      if (userId) await fetchHistory(supabase, userId)
    } catch { Alert.alert('Hata', 'Antrenman tamamlanamadı') }
    finally { setFinishing(false) }
  }

  function handleDeleteWorkout() {
    if (!todayWorkout) return
    const setCount = todayWorkout.workout_sets?.length ?? 0
    Alert.alert(
      'Antrenmanı sil',
      `"${todayWorkout.name ?? 'Bugünkü antrenman'}" ve ${setCount} set silinecek. Emin misin?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await removeWorkout(supabase, todayWorkout.id)
                if (userId) await fetchHistory(supabase, userId)
              } catch { Alert.alert('Hata', 'Antrenman silinemedi') }
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
      Alert.alert('Eksik bilgi', 'Program adı ve en az bir gün gerekli.')
      return
    }
    setSavingProgram(true)
    try {
      await createProgramWithDays(supabase, userId, { name, split_type: 'custom', frequency_per_week: days.length }, days)
      setShowCreateProgram(false)
      Alert.alert('Program oluşturuldu', 'Şimdi programı açıp günlerine hareket ekleyebilirsin.')
    } catch {
      Alert.alert('Hata', 'Program oluşturulamadı')
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
    } catch {
      Alert.alert('Hata', 'Hareket eklenemedi')
    }
  }

  async function handleRemoveProgramExercise(rowId: string) {
    if (!userId) return
    try {
      await removeExerciseFromDay(supabase, userId, rowId)
    } catch {
      Alert.alert('Hata', 'Hareket silinemedi')
    }
  }

  function handleDeleteProgram(program: WorkoutProgram) {
    Alert.alert('Programı sil', `"${program.name}" kalıcı olarak silinecek. Emin misin?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => void (async () => {
          try {
            await deleteProgram(supabase, program.id)
            setSelectedProgram(null)
            setExpandedDay(null)
          } catch {
            Alert.alert('Hata', 'Program silinemedi')
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
      Alert.alert('Bilgi', 'Bu günde tanımlı egzersiz yok')
      return
    }
    if (todayWorkout?.status === 'completed') {
      Alert.alert('Antrenman tamamlandı', 'Bugünkü antrenman zaten tamamlanmış durumda.')
      return
    }

    const dayName = day.day_name?.trim() || `Gün ${day.day_number}`
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
      const rows = dayExercises.flatMap((ex) => {
        const setCount = Math.min(12, Math.max(1, ex.sets ?? 3))  // bozuk program datasına karşı sınır
        return Array.from({ length: setCount }, (_, i) => ({
          workout_id: workout.id,
          exercise_id: ex.exercise_id,
          set_number: i + 1,
          reps: ex.reps ?? 10,
          rest_seconds: ex.rest_seconds,
        }))
      })
      await addSets(supabase, workout.id, rows)
      await fetchHistory(supabase, userId)
      setTab('today')
    } catch {
      Alert.alert('Hata', 'Program günü başlatılamadı')
      if (userId) await fetchTodayWorkout(supabase, userId, todayStr)
    } finally {
      setStarting(false)
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
          .map((ex) => `  • ${ex.exercise_name} — ${ex.sets}x${ex.reps} · ${ex.rest_seconds}sn`)
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
        : (data.message ?? 'Yanıt alınamadı')

      setCoachMsgs((m) => [...m, {
        role: 'assistant',
        content,
        actions: plan
          ? [{
              label: `Programı kaydet (${plan.days.length} gün)`,
              icon: 'bookmark-outline' as const,
              doneLabel: 'Kaydedildi',
              onPress: async () => {
                try {
                  await createProgramFromPlan(supabase, userId, plan)
                  setShowCoach(false)
                  setTab('programs')
                } catch {
                  Alert.alert('Hata', 'Program kaydedilemedi')
                  throw new Error('save failed')
                }
              },
            }]
          : [],
      }])
    } catch {
      setCoachMsgs((m) => [...m, { role: 'assistant', content: 'Koça ulaşılamadı. Pro aboneliğini ve bağlantını kontrol et.' }])
    } finally {
      setCoachLoading(false)
    }
  }

  const filteredExercises = exercises.filter((e) => {
    const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase()) || (e.name_en ?? '').toLowerCase().includes(search.toLowerCase())
    const matchGroup = !filterGroupId || e.muscle_group_id === filterGroupId
    return matchSearch && matchGroup
  })

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
    full_body: 'Full Body', upper_lower: 'Upper Lower', custom: 'Özel',
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
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.workout }}>Egzersiz Ekle</Text>
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
                  <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>Antrenman Koçu</Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>
                    Soru sor veya haftalık program yazdır
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => { if (requirePro()) setShowCoach(true) }}
                  disabled={isCheckingPro}
                  style={{ paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: radius.full, backgroundColor: `${palette.accent}18`, borderWidth: 1, borderColor: `${palette.accent}35`, opacity: isPro ? 1 : 0.6 }}
                >
                  <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: palette.accent }}>
                    {isPro ? 'Sohbet' : 'Pro'}
                  </Text>
                </TouchableOpacity>
              </View>
            </GlassCard>

            {!todayWorkout && (
              <View style={{ paddingVertical: spacing[6], gap: spacing[5] }}>
                <View style={{ alignItems: 'center', gap: spacing[3] }}>
                  <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: `${palette.workout}15`, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="barbell-outline" size={36} color={palette.workout} />
                  </View>
                  <View style={{ alignItems: 'center', gap: spacing[2] }}>
                    <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{t.work_no_workout}</Text>
                    <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle, textAlign: 'center', maxWidth: 220 }}>
                      {t.work_no_workout_hint}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => setShowStart(true)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: radius.full, backgroundColor: palette.workout }}
                >
                  <Ionicons name="play-circle-outline" size={20} color="#fff" />
                  <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.bold, color: '#fff' }}>{t.work_start}</Text>
                </TouchableOpacity>

                {exercises.length > 0 && (
                  <View style={{ gap: spacing[2] }}>
                    <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      Popüler Egzersizler
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
                      {exercises.slice(0, 6).map((ex) => (
                        <View
                          key={ex.id}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing[3], paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border }}
                        >
                          <Ionicons name="barbell-outline" size={12} color={palette.workout} />
                          <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: colors.textSecondary }}>{ex.name}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )}

            {todayWorkout ? (
              <GlassCard>
                {/* Workout header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[3] }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], flex: 1 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${palette.workout}18`, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="barbell" size={20} color={palette.workout} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary }} numberOfLines={1}>{todayWorkout.name}</Text>
                      <Text style={{ fontSize: fontSize.xs, color: todayWorkout.status === 'completed' ? palette.success : colors.textMuted }}>
                        {todayWorkout.status === 'completed'
                          ? `${t.work_completed} · ${todayWorkout.workout_sets?.length ?? 0} set`
                          : `● Devam · ${todayWorkout.workout_sets?.length ?? 0} set`}
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

                {/* Sets: always visible when in-progress, collapsible when completed */}
                {(todayWorkout.status !== 'completed' || setsExpanded) && (
                  <>
                    {(todayWorkout.workout_sets?.length ?? 0) > 0 ? (
                      <View style={{ gap: 2, marginBottom: spacing[4] }}>
                        {todayWorkout.workout_sets?.map((set: WorkoutSet) => (
                          <SetRow key={set.id} set={set} onDelete={todayWorkout.status !== 'completed' ? () => removeSet(supabase, set.id) : undefined} />
                        ))}
                      </View>
                    ) : (
                      <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle, textAlign: 'center', paddingVertical: spacing[3] }}>
                        {t.work_exercise_search}
                      </Text>
                    )}
                  </>
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
                              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{ex.name}</Text>
                              <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>
                                {ex.muscle_group?.name ?? '—'} · {CATEGORY_LABELS[ex.category] ?? ex.category}
                                {ex.is_bodyweight ? ' · Vücut ağırlığı' : ''}
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
          </>
        )}

        {/* ── LIBRARY ── */}
        {tab === 'library' && (
          <>
            <Input value={search} onChangeText={setSearch} placeholder="Egzersiz ara... (ör: squat, bench press)" containerStyle={{ marginBottom: spacing[3] }} />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing[4] }}>
              <View style={{ flexDirection: 'row', gap: spacing[2] }}>
                <TouchableOpacity onPress={() => setFilterGroupId(null)} style={{ paddingHorizontal: spacing[3], paddingVertical: 7, borderRadius: radius.full, backgroundColor: !filterGroupId ? palette.accent : colors.glassInner, borderWidth: 1, borderColor: !filterGroupId ? palette.accent : colors.border }}>
                  <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: !filterGroupId ? '#fff' : colors.textMuted }}>Tümü ({exercises.length})</Text>
                </TouchableOpacity>
                {muscleGroups.map((mg) => (
                  <TouchableOpacity key={mg.id} onPress={() => setFilterGroupId(filterGroupId === mg.id ? null : mg.id)} style={{ paddingHorizontal: spacing[3], paddingVertical: 7, borderRadius: radius.full, backgroundColor: filterGroupId === mg.id ? palette.workout : colors.glassInner, borderWidth: 1, borderColor: filterGroupId === mg.id ? palette.workout : colors.border }}>
                    <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: filterGroupId === mg.id ? '#fff' : colors.textMuted }}>{mg.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, marginBottom: spacing[3] }}>
              {filteredExercises.length} egzersiz{todayWorkout && todayWorkout.status !== 'completed' ? ' · "Ekle" ile sete başla' : ''}
            </Text>

            <View style={{ gap: spacing[2] }}>
              {filteredExercises.map((ex) => (
                <GlassCard key={ex.id} padding={spacing[4]} noShadow>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{ex.name}</Text>
                      <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 }}>
                        {ex.muscle_group?.name ?? '—'} · {CATEGORY_LABELS[ex.category] ?? ex.category}
                        {ex.is_bodyweight ? ' · Vücut ağırlığı' : ''}
                      </Text>
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
                  <Text style={{ color: colors.textSubtle }}>Sonuç yok</Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* ── PROGRAMS ── */}
        {tab === 'programs' && (
          <View style={{ gap: spacing[3] }}>
            <TouchableOpacity
              onPress={() => { setNewProgramName(''); setNewDayNames(['Gün 1', 'Gün 2', 'Gün 3']); setShowCreateProgram(true) }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], paddingVertical: spacing[3], borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.accent }}
            >
              <Ionicons name="add" size={18} color={palette.accent} />
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.accent }}>Kendi Programını Oluştur</Text>
            </TouchableOpacity>
            {programs.length === 0 ? (
              <View style={{ paddingTop: spacing[8], alignItems: 'center', gap: spacing[3] }}>
                <Ionicons name="list-outline" size={48} color={colors.textSubtle} />
                <Text style={{ fontSize: fontSize.base, color: colors.textSubtle }}>Program yüklenemedi</Text>
                <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle, textAlign: 'center' }}>Migration'ları çalıştırdıktan sonra programlar görünecek</Text>
              </View>
            ) : (
              programs.map((prog) => (
                <ProgramCard
                  key={prog.id}
                  program={prog}
                  splitLabel={SPLIT_LABELS[prog.split_type] ?? prog.split_type}
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
              <Text style={{ fontSize: fontSize.base, color: colors.textSubtle }}>Geçmiş antrenman yok</Text>
            </View>
          ) : (
            <View style={{ gap: spacing[3] }}>
              {workoutHistory.map((w) => (
                <GlassCard key={w.id} padding={spacing[4]} noShadow>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{w.name}</Text>
                      <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 }}>
                        {new Date(w.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', weekday: 'short' })}
                        {w.duration_minutes ? ` · ${w.duration_minutes} dk` : ''}
                      </Text>
                    </View>
                    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.md, backgroundColor: `${HISTORY_STATUS[w.status]?.color ?? palette.warning}18` }}>
                      <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: HISTORY_STATUS[w.status]?.color ?? palette.warning }}>
                        {HISTORY_STATUS[w.status]?.label ?? w.status}
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
          <Input label="Antrenman adı" value={workoutName} onChangeText={setWorkoutName} placeholder="Üst beden, Bacak günü, Push Day..." autoFocus />
          <Button label={starting ? 'Başlatılıyor...' : 'Başlat'} onPress={handleStart} loading={starting} fullWidth />
        </View>
      </BottomSheet>

      {/* Add set (exercise selected from library) */}
      <BottomSheet visible={!!selectedExercise} onClose={() => setSelectedExercise(null)} title="Set Ekle">
        <View style={{ gap: spacing[4] }}>
          {selectedExercise && (
            <View style={{ padding: spacing[3], borderRadius: radius.lg, backgroundColor: `${palette.workout}10`, borderWidth: 1, borderColor: `${palette.workout}25` }}>
              <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{selectedExercise.name}</Text>
              <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 }}>
                {selectedExercise.muscle_group?.name} · {CATEGORY_LABELS[selectedExercise.category]}
              </Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <Input label="Tekrar" value={setReps} onChangeText={setSetReps} keyboardType="number-pad" placeholder="10" containerStyle={{ flex: 1 }} />
            {!selectedExercise?.is_bodyweight && (
              <Input label="Ağırlık (kg)" value={setWeight} onChangeText={setSetWeight} keyboardType="decimal-pad" placeholder="60" containerStyle={{ flex: 1 }} />
            )}
          </View>
          <Button label={addingSet ? 'Ekleniyor...' : 'Set Ekle'} onPress={handleAddSet} loading={addingSet} fullWidth />
        </View>
      </BottomSheet>

      {/* Finish */}
      <BottomSheet visible={showFinish} onClose={() => setShowFinish(false)} title="Antrenmanı Tamamla">
        <View style={{ gap: spacing[4] }}>
          <Input label="Toplam süre (dakika)" value={duration} onChangeText={setDuration} keyboardType="number-pad" placeholder="45" autoFocus />
          <Button label={finishing ? 'Kaydediliyor...' : 'Tamamla'} onPress={handleFinish} loading={finishing} fullWidth />
        </View>
      </BottomSheet>

      {/* Program day picker */}
      <BottomSheet
        visible={!!selectedProgram}
        onClose={() => { setSelectedProgram(null); setExpandedDay(null) }}
        title={liveProgram ? liveProgram.name : 'Program'}
        scrollable
      >
        <View style={{ gap: spacing[2] }}>
          {todayWorkout && todayWorkout.status !== 'completed' && (
            <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginBottom: spacing[1] }}>
              Bugün açık bir antrenman var — seçtiğin günün setleri onun üzerine eklenecek.
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
                    <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{day.day_name || `Gün ${day.day_number}`}</Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>
                      {exCount === 0 ? 'Egzersiz tanımlı değil' : `${exCount} egzersiz · ${setCount} set`}
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
                          {ex.exercise?.name ?? 'Egzersiz'}
                        </Text>
                        <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
                          {ex.sets}×{ex.reps ?? '—'} · {ex.rest_seconds}sn
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
                        {isOwnProgram ? 'Bu güne henüz hareket eklemedin.' : 'Bu günde tanımlı hareket yok.'}
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
                        <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: palette.accent }}>Hareket Ekle</Text>
                      </TouchableOpacity>
                    )}

                    {exCount > 0 && (
                      <TouchableOpacity
                        disabled={starting}
                        onPress={() => void handleStartFromProgramDay(liveProgram as WorkoutProgram, day.id)}
                        style={{ marginTop: spacing[1], paddingVertical: spacing[3], borderRadius: radius.lg, alignItems: 'center', backgroundColor: palette.accent, opacity: starting ? 0.5 : 1 }}
                      >
                        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: '#fff' }}>
                          {starting ? 'Başlatılıyor...' : 'Bu günle başla'}
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
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.danger }}>Programı Sil</Text>
            </TouchableOpacity>
          )}
        </View>
      </BottomSheet>

      {/* Kendi programını oluştur */}
      <BottomSheet
        visible={showCreateProgram}
        onClose={() => setShowCreateProgram(false)}
        title="Kendi Programını Oluştur"
        scrollable
      >
        <View style={{ gap: spacing[3] }}>
          <Input label="Program adı" value={newProgramName} onChangeText={setNewProgramName} placeholder="Örn: Kalça Günü Ağırlıklı" />

          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary }}>
            Haftalık günler ({newDayNames.length})
          </Text>
          <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
            Önce günleri kur, sonra programı açıp her güne hareket ekle.
          </Text>

          {newDayNames.map((name, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
              <Input
                value={name}
                onChangeText={(value) => setNewDayNames((days) => days.map((d, index) => index === i ? value : d))}
                placeholder={`Gün ${i + 1}`}
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
              onPress={() => setNewDayNames((days) => [...days, `Gün ${days.length + 1}`])}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[1], paddingVertical: spacing[2], borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong }}
            >
              <Ionicons name="add" size={16} color={palette.accent} />
              <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: palette.accent }}>Gün Ekle</Text>
            </TouchableOpacity>
          )}

          <Button
            label={savingProgram ? 'Oluşturuluyor...' : 'Programı Oluştur'}
            onPress={() => void handleCreateProgram()}
            loading={savingProgram}
            fullWidth
          />
        </View>
      </BottomSheet>

      {/* Güne hareket ekle — kütüphaneden seç */}
      <BottomSheet
        visible={!!addingToDay}
        onClose={() => setAddingToDay(null)}
        title="Hareket Ekle"
        scrollable
      >
        <View style={{ gap: spacing[3] }}>
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <Input label="Set" value={pickerSets} onChangeText={setPickerSets} keyboardType="number-pad" containerStyle={{ flex: 1 }} />
            <Input label="Tekrar" value={pickerReps} onChangeText={setPickerReps} keyboardType="number-pad" containerStyle={{ flex: 1 }} />
          </View>
          <Input label="Egzersiz ara" value={pickerSearch} onChangeText={setPickerSearch} placeholder="hip thrust, squat..." />
          {exercises
            .filter((e) => !pickerSearch || e.name.toLowerCase().includes(pickerSearch.toLowerCase()) || (e.name_en ?? '').toLowerCase().includes(pickerSearch.toLowerCase()))
            .slice(0, 25)
            .map((e) => (
              <TouchableOpacity
                key={e.id}
                onPress={() => void handleAddExerciseToDay(e.id)}
                style={{ paddingVertical: spacing[3], paddingHorizontal: spacing[3], borderRadius: radius.lg, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border }}
              >
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{e.name}</Text>
                {e.muscle_group?.name && (
                  <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>{e.muscle_group.name}</Text>
                )}
              </TouchableOpacity>
            ))}
        </View>
      </BottomSheet>

      <AiChatSheet
        visible={showCoach}
        onClose={() => setShowCoach(false)}
        title="Antrenman Koçu"
        accent={palette.accent}
        messages={coachMsgs}
        loading={coachLoading}
        input={coachInput}
        onChangeInput={setCoachInput}
        onSend={() => { void sendCoach(coachInput) }}
        placeholder="Program iste veya soru sor..."
        emptyHint="Geçmiş antrenmanlarına ve egzersiz kütüphanene bakarak konuşuyorum. İstersen haftalık program yazıp tek dokunuşla kaydedebilirim."
        suggestions={COACH_SUGGESTIONS}
        onSuggestionPress={(text) => { void sendCoach(text) }}
      />
    </ScreenBackground>
  )
}

function ProgramCard({ program, splitLabel, onStart }: { program: WorkoutProgram; splitLabel: string; onStart: () => void }) {
  const { colors } = useTheme()
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
                <Text style={{ fontSize: fontSize.xs, color: palette.accent, fontWeight: fontWeight.medium }}>Şablon</Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }} numberOfLines={2}>{program.description}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing[2], marginBottom: spacing[3] }}>
        <View style={{ paddingHorizontal: spacing[3], paddingVertical: 4, borderRadius: radius.full, backgroundColor: `${palette.workout}12`, borderWidth: 1, borderColor: `${palette.workout}25` }}>
          <Text style={{ fontSize: fontSize.xs, color: palette.workout, fontWeight: fontWeight.medium }}>{splitLabel}</Text>
        </View>
        <View style={{ paddingHorizontal: spacing[3], paddingVertical: 4, borderRadius: radius.full, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{dayCount} gün/hafta</Text>
        </View>
      </View>

      {/* Day names */}
      {program.days && program.days.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1], marginBottom: spacing[3] }}>
          {program.days.slice(0, 6).map((day) => (
            <View key={day.id} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: day.is_rest ? colors.glassInner : `${palette.workout}10` }}>
              <Text style={{ fontSize: fontSize.xs, color: day.is_rest ? colors.textSubtle : palette.workout }}>
                {day.is_rest ? 'Dinlenme' : day.day_name}
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
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: '#fff' }}>Programı İncele</Text>
      </TouchableOpacity>
    </GlassCard>
  )
}

function SetRow({ set, onDelete }: { set: WorkoutSet; onDelete?: () => void }) {
  const { colors } = useTheme()
  const name = set.exercise?.name ?? `Egzersiz #${set.set_number}`
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[2], borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing[3] }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: `${palette.workout}18`, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: palette.workout }}>{set.set_number}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{name}</Text>
        <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
          {set.reps ?? '—'} tekrar{set.weight_kg ? ` · ${set.weight_kg}kg` : ''}
        </Text>
      </View>
      {onDelete && (
        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close-circle-outline" size={18} color={colors.textSubtle} />
        </TouchableOpacity>
      )}
    </View>
  )
}
