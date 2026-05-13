import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, TextInput, Modal, ActivityIndicator, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useWorkoutStore, WORKOUT_STATUS_LABELS, WORKOUT_CATEGORY_LABELS, BODY_REGION_LABELS } from '@lifeos/shared'
import type { WorkoutCategory, BodyRegion, Exercise, AiWorkoutPlan } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { todayDate } from '@lifeos/shared'
import { estimateCalories } from '@lifeos/shared/supabase'
import { T, HEADER_BTN } from '@/src/theme'
import { GradientBackground } from '@/src/components/GradientBackground'

const CATEGORY_COLORS: Record<WorkoutCategory, string> = {
  strength: T.accent, cardio: T.danger, flexibility: T.success, mobility: T.blockType.workout,
}

type ActiveTab = 'today' | 'library' | 'programs'
type EquipmentFilter = 'all' | 'bodyweight' | 'dumbbell' | 'barbell' | 'kettlebell' | 'cable' | 'pullup_bar' | 'machine'
const EQUIPMENT_LABELS: Record<EquipmentFilter, string> = {
  all: 'Tumu', bodyweight: 'Vucut agirligi', dumbbell: 'Dumbbell', barbell: 'Barbell', kettlebell: 'Kettlebell', cable: 'Cable', pullup_bar: 'Barfiks', machine: 'Makine',
}

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
interface WorkoutAssistantProgram {
  name: string
  description: string
  exercises: Array<{ exercise_name: string; sets: number; reps: number; weight_kg: number }>
}

function normalizeExerciseName(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export default function WorkoutScreen() {
  const today = todayDate()
  const [userId, setUserId]   = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab]   = useState<ActiveTab>('today')

  const [showStartModal, setShowStartModal]     = useState(false)
  const [showAddSetModal, setShowAddSetModal]   = useState(false)
  const [showFinishModal, setShowFinishModal]   = useState(false)
  const [showNewProgModal, setShowNewProgModal] = useState(false)
  const [workoutName, setWorkoutName]   = useState('')
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null)
  const [reps, setReps]       = useState('10')
  const [weight, setWeight]   = useState('')
  const [duration, setDuration] = useState('')
  const [saving, setSaving]   = useState(false)

  const [searchQuery, setSearchQuery]     = useState('')
  const [filterRegion, setFilterRegion]   = useState<BodyRegion | 'all'>('all')
  const [filterCat, setFilterCat]         = useState<WorkoutCategory | 'all'>('all')
  const [filterEquip, setFilterEquip]     = useState<EquipmentFilter>('all')

  const [programs, setPrograms]           = useState<WorkoutProgram[]>([])
  const [progName, setProgName]           = useState('')
  const [progDesc, setProgDesc]           = useState('')
  const [progExercises, setProgExercises] = useState<ProgramExercise[]>([])
  const [progTab, setProgTab]             = useState<'manual' | 'ai'>('manual')
  const [aiPrompt, setAiPrompt]           = useState('')
  const [aiProgLoading, setAiProgLoading] = useState(false)
  const [programChat, setProgramChat]     = useState<WorkoutAssistantMessage[]>([])

  const [aiLoading, setAiLoading]   = useState(false)
  const [aiTips, setAiTips]         = useState<AiWorkoutPlan[]>([])
  const [userWeightKg, setUserWeightKg] = useState(75)
  const workoutStartedAt = useRef<number | null>(null)

  const { todayWorkout, exercises, muscleGroups, fetchTodayWorkout, fetchLibrary, startWorkout, finishWorkout, addSet, removeSet, setWorkoutAiPlan } = useWorkoutStore()

  const getLatestExerciseLibrary = useCallback((): Exercise[] => {
    const latestExercises = useWorkoutStore.getState().exercises
    return latestExercises.length > 0 ? latestExercises : exercises
  }, [exercises])

  const applyAssistantProgram = useCallback((program: WorkoutAssistantProgram) => {
    const exerciseLibrary = getLatestExerciseLibrary()
    const mappedExercises = program.exercises.flatMap((exercise) => {
      const target = normalizeExerciseName(exercise.exercise_name)
      const match = exerciseLibrary.find((item) => {
        const candidate = normalizeExerciseName(item.name)
        return candidate === target || candidate.includes(target) || target.includes(candidate)
      })
      if (!match) return []
      return [{
        exercise_id: match.id,
        exercise_name: match.name,
        sets: exercise.sets,
        reps: exercise.reps,
        weight_kg: exercise.weight_kg,
      }]
    })

    if (mappedExercises.length === 0) {
      Alert.alert('AI Programi', 'Olusan taslak kutuphane egzersizleri ile eslesmedi')
      return
    }

    setProgName(program.name)
    setProgDesc(program.description)
    setProgExercises(mappedExercises)
    setProgTab('manual')
    Alert.alert('Hazir', 'AI taslagi program formuna aktarildi')
  }, [getLatestExerciseLibrary])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      void loadPrograms(user.id)
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('preferences')
        .eq('id', user.id)
        .single()
      const prefs = (profile?.preferences as Record<string, unknown>) ?? {}
      const w = prefs['body_weight_kg']
      if (typeof w === 'number' && w > 0) setUserWeightKg(w)
    })
  }, [])

  const loadPrograms = useCallback(async (uid: string) => {
    try {
      const raw = await AsyncStorage.getItem(`lifeos_programs_${uid}`)
      if (raw) setPrograms(JSON.parse(raw) as WorkoutProgram[])
    } catch { /* ignore */ }
  }, [])

  const savePrograms = useCallback(async (uid: string, list: WorkoutProgram[]) => {
    setPrograms(list)
    try {
      await AsyncStorage.setItem(`lifeos_programs_${uid}`, JSON.stringify(list))
    } catch { /* ignore */ }
  }, [])

  const loadData = useCallback(async (uid: string, options?: { forceLibrary?: boolean }) => {
    await Promise.all([
      fetchTodayWorkout(supabase, uid, today),
      fetchLibrary(supabase, { force: options?.forceLibrary }),
    ])
  }, [today, fetchTodayWorkout, fetchLibrary])

  useEffect(() => { if (userId) void loadData(userId) }, [userId, loadData])

  const onRefresh = useCallback(async () => {
    if (!userId) return; setRefreshing(true); await loadData(userId, { forceLibrary: true }); setRefreshing(false)
  }, [userId, loadData])

  const handleStartWorkout = useCallback(async (name?: string) => {
    if (!userId) return
    setSaving(true)
    try {
      await startWorkout(supabase, userId, { name: name ?? workoutName.trim(), date: today })
      workoutStartedAt.current = Date.now()
      setShowStartModal(false); setWorkoutName('')
    } catch { Alert.alert('Hata', 'Antrenman başlatılamadı') }
    finally { setSaving(false) }
  }, [userId, workoutName, today, startWorkout])

  const handleStartFromProgram = useCallback(async (prog: WorkoutProgram) => {
    if (!userId) return
    setSaving(true)
    try {
      const workout = await startWorkout(supabase, userId, { name: prog.name, date: today })
      workoutStartedAt.current = Date.now()
      for (const pe of prog.exercises) {
        for (let s = 1; s <= pe.sets; s++) {
          await addSet(supabase, { workout_id: workout.id, exercise_id: pe.exercise_id, set_number: s, reps: pe.reps, weight_kg: pe.weight_kg > 0 ? pe.weight_kg : undefined })
        }
      }
      setActiveTab('today')
      Alert.alert('Basladi', `"${prog.name}" programindan antrenman baslatildi`)
    } catch { Alert.alert('Hata', 'Başlatılamadı') }
    finally { setSaving(false) }
  }, [userId, today, startWorkout, addSet])

  const handleAddSet = useCallback(async () => {
    if (!todayWorkout || !selectedExercise) return
    setSaving(true)
    try {
      await addSet(supabase, { workout_id: todayWorkout.id, exercise_id: selectedExercise.id, set_number: (todayWorkout.workout_sets?.length ?? 0) + 1, reps: reps ? parseInt(reps, 10) : undefined, weight_kg: weight ? parseFloat(weight) : undefined, duration_seconds: duration ? parseInt(duration, 10) : undefined })
      setShowAddSetModal(false); setReps('10'); setWeight(''); setDuration(''); setSelectedExercise(null)
    } catch { Alert.alert('Hata', 'Set eklenemedi') }
    finally { setSaving(false) }
  }, [todayWorkout, selectedExercise, reps, weight, duration, addSet])

  const handleFinishWorkout = useCallback(async () => {
    if (!userId || !todayWorkout) return
    setSaving(true)
    try {
      const sets = todayWorkout.workout_sets ?? []
      const avgMet = sets.length > 0 ? sets.reduce((sum, s) => sum + (s.exercise?.met_value ?? 5), 0) / sets.length : 5
      const elapsedMin = workoutStartedAt.current
        ? Math.max(1, Math.round((Date.now() - workoutStartedAt.current) / 60_000))
        : 60
      const estimatedCal = estimateCalories(avgMet, userWeightKg, elapsedMin)
      await finishWorkout(supabase, todayWorkout.id, elapsedMin, estimatedCal > 0 ? estimatedCal : undefined)
      workoutStartedAt.current = null
      setShowFinishModal(false)
      Alert.alert('Tebrikler! 🎉', `~${estimatedCal} kcal yakıldı`)
    } catch { Alert.alert('Hata', 'Tamamlanamadı') }
    finally { setSaving(false) }
  }, [userId, todayWorkout, userWeightKg, finishWorkout])

  const handleRemoveSet = useCallback((setId: string) => {
    Alert.alert('Seti Sil', 'Bu seti silmek istiyor musun?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => void removeSet(supabase, setId) },
    ])
  }, [removeSet])

  const handleGetAiCoach = useCallback(async () => {
    if (!userId) return
    setAiLoading(true)
    try {
      let { data: { session } } = await supabase.auth.getSession()
      if (!session) { const { data: r } = await supabase.auth.refreshSession(); session = r.session }
      if (!session) throw new Error('Oturum bulunamadı')
      const response = await fetch(`${process.env['EXPO_PUBLIC_SUPABASE_URL']}/functions/v1/ai-suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: process.env['EXPO_PUBLIC_SUPABASE_ANON_KEY']!, Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ type: 'workout_plan', energy_level: 3, available_minutes: 60 }),
      })
      if (!response.ok) throw new Error()
      const data = await response.json()
      const raw = (data as { suggestions?: unknown[] }).suggestions ?? []
      const suggestions = raw.filter((s): s is AiWorkoutPlan => typeof s === 'object' && s !== null && 'type' in s && 'message' in s)
      setAiTips(suggestions)
      if (todayWorkout) await setWorkoutAiPlan(supabase, todayWorkout.id, suggestions)
    } catch { Alert.alert('Hata', 'AI önerisi alınamadı') }
    finally { setAiLoading(false) }
  }, [userId, todayWorkout, setWorkoutAiPlan])

  const handleAiProgram = useCallback(async () => {
    const prompt = aiPrompt.trim()
    if (!prompt) return
    setAiProgLoading(true)
    setProgramChat((current) => [...current, { role: 'user', text: prompt }])
    setAiPrompt('')
    try {
      // Egzersiz kütüphanesi yüklenmemişse önce yükle
      if (exercises.length === 0) {
        await fetchLibrary(supabase)
      }
      const exerciseLibrary = getLatestExerciseLibrary()
      if (exerciseLibrary.length === 0) {
        setProgramChat((current) => [...current, { role: 'assistant', text: 'Egzersiz kutuphanesi henuz yuklenmedi. Birazdan tekrar dene.' }])
        return
      }
      let { data: { session } } = await supabase.auth.getSession()
      if (!session) { const { data: r } = await supabase.auth.refreshSession(); session = r.session }
      if (!session) throw new Error('Oturum bulunamadı')
      const { data, error } = await supabase.functions.invoke('ai-suggest', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          type: 'workout_program_chat',
          user_message: prompt,
          workout_context: {
            history: programChat,
            available_exercises: exerciseLibrary.map((exercise) => ({
              name: exercise.name,
              category: exercise.category,
              muscle_group: exercise.muscle_group?.name,
              is_bodyweight: exercise.is_bodyweight,
            })),
          },
        },
      })
      if (error) throw error
      const result = data as { message?: string; program?: WorkoutAssistantProgram }
      const assistantText = result.message?.trim() || 'Bir program taslagi hazirlandi.'
      setProgramChat((current) => [...current, { role: 'assistant', text: assistantText }])
      if (result.program) {
        applyAssistantProgram(result.program)
      }
    } catch {
      setProgramChat((current) => [...current, { role: 'assistant', text: 'Program asistani simdi yanit veremedi.' }])
      Alert.alert('Hata', 'AI program asistani kullanilamadi')
    }
    finally { setAiProgLoading(false) }
  }, [aiPrompt, applyAssistantProgram, exercises, fetchLibrary, getLatestExerciseLibrary, programChat])

  const handleSaveProgram = useCallback(async () => {
    if (!userId || !progName.trim() || progExercises.length === 0) return
    const newProg: WorkoutProgram = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: progName.trim(),
      description: progDesc, exercises: progExercises, created_at: new Date().toISOString(),
    }
    await savePrograms(userId, [...programs, newProg])
    setShowNewProgModal(false); setProgName(''); setProgDesc(''); setProgExercises([])
      Alert.alert('Kaydedildi', `"${newProg.name}" programi olusturuldu`)
  }, [userId, progName, progDesc, progExercises, programs])

  const filteredExercises = exercises.filter((ex) => {
    const normalizedName = normalizeExerciseName(ex.name)
    if (searchQuery && !ex.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (filterRegion !== 'all') {
      const mg = muscleGroups.find((m) => m.id === ex.muscle_group_id)
      if (!mg || mg.body_region !== filterRegion) return false
    }
    if (filterCat !== 'all' && ex.category !== filterCat) return false
    if (filterEquip === 'bodyweight' && !ex.is_bodyweight) return false
    if (filterEquip === 'dumbbell' && !DUMBBELL_PATTERN.test(ex.name)) return false
    if (filterEquip === 'barbell' && !BARBELL_PATTERN.test(ex.name) && !BARBELL_EXACT_NAMES.has(normalizedName)) return false
    if (filterEquip === 'kettlebell' && !KETTLEBELL_PATTERN.test(ex.name)) return false
    if (filterEquip === 'cable' && !CABLE_PATTERN.test(ex.name)) return false
    if (filterEquip === 'pullup_bar' && !PULLUP_BAR_PATTERN.test(ex.name)) return false
    if (filterEquip === 'machine' && !MACHINE_PATTERN.test(ex.name)) return false
    return true
  })

  const REGIONS: (BodyRegion | 'all')[] = ['all', 'upper', 'lower', 'core', 'full']
  const CATEGORIES: (WorkoutCategory | 'all')[] = ['all', 'strength', 'cardio', 'flexibility', 'mobility']
  const EQUIPS: EquipmentFilter[] = ['all', 'bodyweight', 'dumbbell', 'barbell', 'kettlebell', 'cable', 'pullup_bar', 'machine']

  return (
    <GradientBackground>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, paddingTop: 56 }}>
        <Text style={{ fontSize: 28, fontWeight: '800', color: T.text.primary, letterSpacing: -0.5 }}>Antrenman</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {!todayWorkout && programs.length > 0 && (
            <TouchableOpacity onPress={() => setActiveTab('programs')} className="rounded-xl border border-gray-200 px-3 py-2">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="list-outline" size={14} color={T.text.primary} />
                <Text className="text-xs font-semibold text-primary">Program</Text>
              </View>
            </TouchableOpacity>
          )}
          {!todayWorkout && (
            <TouchableOpacity onPress={() => setShowStartModal(true)} style={HEADER_BTN}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: T.btn.header.text }}>Başlat</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tabs */}
      <View className="flex-row border-b border-gray-100 px-5">
        {(['today', 'library', 'programs'] as ActiveTab[]).map((tab) => (
          <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} className="mr-6 pb-2"
            style={{ borderBottomWidth: activeTab === tab ? 2 : 0, borderBottomColor: T.accent }}>
            <Text className="text-sm font-semibold" style={{ color: activeTab === tab ? T.accent : T.text.muted }}>
              {tab === 'today' ? 'Bugün' : tab === 'library' ? 'Kütüphane' : 'Programlar'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.accent} />}>

        {/* BUGÜN */}
        {activeTab === 'today' && (
          <View className="py-4">
            {!todayWorkout ? (
              <View className="items-center rounded-2xl border border-dashed border-gray-200 py-12">
                <Ionicons name="barbell-outline" size={34} color={T.text.muted} />
                <Text className="mt-3 text-base font-semibold text-primary">Bugün antrenman yok</Text>
                <TouchableOpacity onPress={() => setShowStartModal(true)} className="mt-4 rounded-xl bg-accent px-6 py-2.5">
                  <Text className="font-semibold text-white">Antrenman Başlat</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View className="mb-4 rounded-2xl border border-gray-100 bg-surface p-4">
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1">
                      <Text className="text-lg font-bold text-primary">{todayWorkout.name ?? 'Antrenman'}</Text>
                      <Text className="text-xs text-muted">{todayWorkout.workout_sets?.length ?? 0} set</Text>
                    </View>
                    {todayWorkout.status !== 'completed' && (
                      <TouchableOpacity onPress={() => setShowFinishModal(true)} className="rounded-xl border border-success px-3 py-1.5">
                        <Text className="text-xs font-semibold text-success">Bitir</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                <View className="mb-4">
                  <View className="mb-2 flex-row items-center justify-between">
                    <Text className="text-sm font-semibold text-muted">Setler</Text>
                    {todayWorkout.status !== 'completed' && (
                      <TouchableOpacity onPress={() => setShowAddSetModal(true)} className="rounded-lg bg-accent/10 px-3 py-1">
                        <Text className="text-xs font-semibold text-accent">+ Set Ekle</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {(!todayWorkout.workout_sets || todayWorkout.workout_sets.length === 0) ? (
                    <View className="items-center rounded-xl border border-dashed border-gray-200 py-6">
                      <Text className="text-sm text-muted">Henüz set eklenmedi</Text>
                    </View>
                  ) : (
                    todayWorkout.workout_sets.map((set, idx) => (
                      <TouchableOpacity key={set.id} onLongPress={() => handleRemoveSet(set.id)}
                        className="mb-2 flex-row items-center rounded-xl border border-gray-100 bg-surface px-4 py-3">
                        <View className="mr-3 h-8 w-8 items-center justify-center rounded-full bg-accent/10">
                          <Text className="text-xs font-bold text-accent">{idx + 1}</Text>
                        </View>
                        <View className="flex-1">
                          <Text className="text-sm font-medium text-primary">{set.exercise?.name ?? 'Egzersiz'}</Text>
                          <Text className="text-xs text-muted">
                            {set.reps ? `${set.reps} tekrar` : ''}{set.reps && set.weight_kg ? ' · ' : ''}{set.weight_kg ? `${set.weight_kg} kg` : ''}
                          </Text>
                        </View>
                        {set.completed && <Text className="text-success">✓</Text>}
                      </TouchableOpacity>
                    ))
                  )}
                </View>
                <View style={{ marginBottom: 32, borderRadius: 16, borderWidth: 1, borderColor: `${T.blockType.workout}25`, backgroundColor: `${T.blockType.workout}08`, padding: 16 }}>
                  <View style={{ marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="sparkles-outline" size={16} color={T.blockType.workout} />
                      <Text style={{ fontSize: 14, fontWeight: '600', color: T.blockType.workout }}>AI Fitness Kocu</Text>
                    </View>
                    <TouchableOpacity onPress={handleGetAiCoach} disabled={aiLoading} style={{ borderRadius: 8, backgroundColor: T.blockType.workout, paddingHorizontal: 12, paddingVertical: 4 }}>
                      {aiLoading ? <ActivityIndicator size="small" color="white" /> : <Text style={{ fontSize: 12, fontWeight: '600', color: 'white' }}>Öneri Al</Text>}
                    </TouchableOpacity>
                  </View>
                  {aiTips.length === 0 && !aiLoading && <Text style={{ fontSize: 12, color: T.text.muted }}>AI koçundan kişiselleştirilmiş öneri al.</Text>}
                  {aiTips.map((tip, i) => (
                    <View key={i} style={{ marginTop: 8, borderRadius: 12, backgroundColor: T.card.bg, padding: 12 }}>
                      <Text style={{ fontSize: 12, fontWeight: '500', color: T.blockType.workout }}>{tip.type === 'rest' ? 'Dinlenme' : tip.type === 'exercise_suggestion' ? 'Egzersiz' : tip.type === 'progression' ? 'Ilerleme' : 'Genel'}</Text>
                      <Text style={{ marginTop: 4, fontSize: 12, color: T.text.secondary }}>{tip.message}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>
        )}

        {/* KÜTÜPHANESİ */}
        {activeTab === 'library' && (
          <View className="py-4">
            <TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Egzersiz ara..." placeholderTextColor="#9CA3AF"
              style={{ borderWidth: 1, borderColor: T.input.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: T.input.text, backgroundColor: T.input.bg, marginBottom: 12 }} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
              {REGIONS.map((r) => (
                <TouchableOpacity key={r} onPress={() => setFilterRegion(r)} style={{ marginRight: 8, borderRadius: T.btn.radius, paddingHorizontal: T.btn.pill.paddingHorizontal, paddingVertical: T.btn.pill.paddingVertical + 2, backgroundColor: filterRegion === r ? T.btn.pill.active_bg : T.btn.pill.bg, borderWidth: 1, borderColor: 'transparent' }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: filterRegion === r ? T.btn.pill.active_text : T.btn.pill.text }}>{r === 'all' ? 'Tümü' : BODY_REGION_LABELS[r]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
              {EQUIPS.map((eq) => (
                <TouchableOpacity key={eq} onPress={() => setFilterEquip(eq)} style={{ marginRight: 8, borderRadius: T.btn.radius, paddingHorizontal: T.btn.pill.paddingHorizontal, paddingVertical: T.btn.pill.paddingVertical + 2, backgroundColor: filterEquip === eq ? T.accent : T.btn.pill.bg, borderWidth: 1, borderColor: 'transparent' }}>
                  <Text className="text-xs font-medium" style={{ color: filterEquip === eq ? 'white' : '#6B7280' }}>{EQUIPMENT_LABELS[eq]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
              {CATEGORIES.map((c) => (
                <TouchableOpacity key={c} onPress={() => setFilterCat(c)} className="mr-2 rounded-full px-3 py-1.5" style={{ backgroundColor: filterCat === c ? (c === 'all' ? T.accent : CATEGORY_COLORS[c]) : T.btn.pill.bg }}>
                  <Text className="text-xs font-medium" style={{ color: filterCat === c ? 'white' : '#6B7280' }}>{c === 'all' ? 'Tümü' : WORKOUT_CATEGORY_LABELS[c]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {filteredExercises.length === 0 ? (
              <View className="items-center py-8"><Text className="text-muted">Egzersiz bulunamadı</Text></View>
            ) : (
              filteredExercises.map((ex) => (
                <TouchableOpacity key={ex.id} onPress={todayWorkout?.status === 'in_progress' ? () => { setSelectedExercise(ex); setShowAddSetModal(true) } : undefined}
                  className="mb-2 rounded-2xl border border-gray-100 bg-surface px-4 py-3" activeOpacity={todayWorkout?.status === 'in_progress' ? 0.7 : 1}>
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1">
                      <Text className="font-medium text-primary">{ex.name}</Text>
                      {ex.muscle_group && <Text className="text-xs text-muted">{ex.muscle_group.name}</Text>}
                    </View>
                    <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: `${CATEGORY_COLORS[ex.category]}20` }}>
                      <Text className="text-xs font-medium" style={{ color: CATEGORY_COLORS[ex.category] }}>{WORKOUT_CATEGORY_LABELS[ex.category]}</Text>
                    </View>
                  </View>
                  {ex.is_bodyweight && <Text className="mt-1 text-xs text-muted">Vücut ağırlığı</Text>}
                  {todayWorkout?.status === 'in_progress' && <Text className="mt-1 text-xs font-medium text-accent">+ Set ekle →</Text>}
                </TouchableOpacity>
              ))
            )}
            <View className="h-8" />
          </View>
        )}

        {/* PROGRAMLAR */}
        {activeTab === 'programs' && (
          <View className="py-4">
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-sm text-muted">Kayıtlı antrenman şablonları</Text>
              <TouchableOpacity onPress={() => { setProgName(''); setProgDesc(''); setProgExercises([]); setShowNewProgModal(true) }} className="rounded-xl bg-accent px-3 py-1.5">
                <Text className="text-xs font-semibold text-white">+ Yeni Program</Text>
              </TouchableOpacity>
            </View>
            {programs.length === 0 ? (
              <View className="items-center rounded-2xl border border-dashed border-gray-200 py-12">
                <Text className="text-3xl">📋</Text>
                <Text className="mt-3 font-medium text-primary">Henüz program yok</Text>
                <Text className="mt-1 text-sm text-muted">Push Day, Pull Day gibi programlarını kaydet</Text>
              </View>
            ) : (
              programs.map((prog) => (
                <View key={prog.id} className="mb-3 rounded-2xl border border-gray-100 bg-surface p-4">
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1">
                      <Text className="font-semibold text-primary">{prog.name}</Text>
                      {prog.description ? <Text className="text-xs text-muted">{prog.description}</Text> : null}
                    </View>
                    <TouchableOpacity onPress={() => {
                      Alert.alert('Sil', `"${prog.name}" silinsin mi?`, [
                        { text: 'İptal', style: 'cancel' },
                        { text: 'Sil', style: 'destructive', onPress: () => void savePrograms(userId!, programs.filter((p) => p.id !== prog.id)) },
                      ])
                    }}>
                      <Text className="text-base text-muted/40">×</Text>
                    </TouchableOpacity>
                  </View>
                  <View className="mt-2">
                    {prog.exercises.map((pe, i) => (
                      <Text key={i} className="text-xs text-muted">{pe.exercise_name} · {pe.sets}×{pe.reps}{pe.weight_kg > 0 ? ` @ ${pe.weight_kg}kg` : ''}</Text>
                    ))}
                  </View>
                  <TouchableOpacity onPress={() => void handleStartFromProgram(prog)} disabled={!!todayWorkout || saving}
                    className="mt-3 items-center rounded-xl bg-accent py-2.5" style={{ opacity: !!todayWorkout || saving ? 0.4 : 1 }}>
                    <Text className="font-semibold text-white">{todayWorkout ? 'Antrenman devam ediyor' : '▶ Bu Programla Başlat'}</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
            <View className="h-8" />
          </View>
        )}
      </ScrollView>

      {/* Start Modal */}
      <Modal visible={showStartModal} transparent animationType="slide">
        <View className="flex-1 justify-end bg-black/40">
          <View className="rounded-t-3xl bg-surface p-6">
            <Text className="mb-4 text-lg font-bold text-primary">Antrenman Başlat</Text>
            <TextInput value={workoutName} onChangeText={setWorkoutName} placeholder="örn: Üst Vücut, Push Day..."
              placeholderTextColor="#9CA3AF" autoFocus
              style={{ borderWidth: 1, borderColor: T.input.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: T.input.text, marginBottom: 24 }} />
            <View className="flex-row gap-3">
              <TouchableOpacity onPress={() => { setShowStartModal(false); setWorkoutName('') }} className="flex-1 items-center rounded-xl border border-gray-200 py-3">
                <Text className="font-medium text-muted">İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void handleStartWorkout()} disabled={!workoutName.trim() || saving}
                className="flex-1 items-center rounded-xl bg-accent py-3" style={{ opacity: !workoutName.trim() || saving ? 0.5 : 1 }}>
                {saving ? <ActivityIndicator size="small" color="white" /> : <Text className="font-semibold text-white">Baslat</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Set Modal */}
      <Modal visible={showAddSetModal} transparent animationType="slide">
        <View className="flex-1 justify-end bg-black/40">
          <View className="rounded-t-3xl bg-surface p-6" style={{ maxHeight: '70%' }}>
            <Text className="mb-4 text-lg font-bold text-primary">{selectedExercise ? selectedExercise.name : 'Set Ekle'}</Text>
            {!selectedExercise && (
              <ScrollView className="mb-4 max-h-40">
                {exercises.map((ex) => (
                  <TouchableOpacity key={ex.id} onPress={() => setSelectedExercise(ex)} className="mb-1 rounded-xl px-3 py-2" style={{ backgroundColor: T.btn.pill.bg }}>
                    <Text className="text-sm text-primary">{ex.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <View className="mb-4 flex-row gap-3">
              <View className="flex-1"><Text className="mb-1 text-xs text-muted">Tekrar</Text><TextInput value={reps} onChangeText={setReps} keyboardType="numeric" style={{ borderWidth: 1, borderColor: T.input.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: T.input.text }} /></View>
              <View className="flex-1"><Text className="mb-1 text-xs text-muted">Ağırlık (kg)</Text><TextInput value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="—" placeholderTextColor="#9CA3AF" style={{ borderWidth: 1, borderColor: T.input.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: T.input.text }} /></View>
              <View className="flex-1"><Text className="mb-1 text-xs text-muted">Süre (sn)</Text><TextInput value={duration} onChangeText={setDuration} keyboardType="numeric" placeholder="—" placeholderTextColor="#9CA3AF" style={{ borderWidth: 1, borderColor: T.input.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: T.input.text }} /></View>
            </View>
            <View className="flex-row gap-3">
              <TouchableOpacity onPress={() => { setShowAddSetModal(false); setSelectedExercise(null); setReps('10'); setWeight(''); setDuration('') }} className="flex-1 items-center rounded-xl border border-gray-200 py-3">
                <Text className="font-medium text-muted">İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void handleAddSet()} disabled={!selectedExercise || saving}
                className="flex-1 items-center rounded-xl bg-accent py-3" style={{ opacity: !selectedExercise || saving ? 0.5 : 1 }}>
                {saving ? <ActivityIndicator size="small" color="white" /> : <Text className="font-semibold text-white">Ekle</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Finish Modal */}
      <Modal visible={showFinishModal} transparent animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full rounded-2xl bg-surface p-6">
            <Text className="mb-2 text-xl font-bold text-primary">Antrenmanı Bitir</Text>
            <Text className="mb-6 text-sm text-muted">{todayWorkout?.workout_sets?.length ?? 0} set tamamlandı.</Text>
            <View className="flex-row gap-3">
              <TouchableOpacity onPress={() => setShowFinishModal(false)} className="flex-1 items-center rounded-xl border border-gray-200 py-3">
                <Text className="font-medium text-muted">Devam Et</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void handleFinishWorkout()} disabled={saving}
                className="flex-1 items-center rounded-xl bg-success py-3" style={{ opacity: saving ? 0.5 : 1 }}>
                {saving ? <ActivityIndicator size="small" color="white" /> : <Text className="font-semibold text-white">Bitir</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Yeni Program Modal */}
      <Modal visible={showNewProgModal} transparent animationType="slide">
        <View className="flex-1 justify-end bg-black/40">
          <View className="rounded-t-3xl bg-surface p-6" style={{ maxHeight: '90%' }}>
            <Text className="mb-4 text-lg font-bold text-primary">Yeni Program</Text>

            {/* Tab: Manuel / AI */}
            <View className="mb-4 flex-row rounded-xl bg-gray-100 p-1">
              {(['manual', 'ai'] as const).map((tab) => (
                <TouchableOpacity key={tab} onPress={() => setProgTab(tab)}
                  className={`flex-1 items-center rounded-lg py-2 ${progTab === tab ? 'bg-white' : ''}`}>
                  <Text className="text-sm font-medium" style={{ color: progTab === tab ? '#1A1A2E' : '#6B7280' }}>
                    {tab === 'manual' ? 'Manuel' : 'AI Asistan'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* AI Sekmesi */}
            {progTab === 'ai' && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text className="mb-2 text-sm text-muted">Hedefini, ekipmanını ve haftalik ritmini yaz. Asistan sana uygulanabilir bir taslak kursun.</Text>
                {programChat.length > 0 && (
                  <View style={{ marginBottom: 12 }}>
                    {programChat.map((message, index) => (
                      <View
                        key={`${message.role}-${index}`}
                        style={{
                          marginBottom: 8,
                          alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                          maxWidth: '86%',
                          borderRadius: 16,
                          backgroundColor: message.role === 'user' ? T.accent : 'rgba(15,23,42,0.06)',
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                        }}
                      >
                        <Text style={{ fontSize: 13, lineHeight: 19, color: message.role === 'user' ? 'white' : T.text.primary }}>{message.text}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <TextInput value={aiPrompt} onChangeText={setAiPrompt} multiline numberOfLines={4}
                  placeholder="Örn: Evde barfiks ve dumbell ile haftada 4 gün hibrit antrenman yapıyorum, kas kazanmak istiyorum, 45 dakika süre var"
                  placeholderTextColor="#9CA3AF"
                  style={{ borderWidth: 1, borderColor: T.input.border, borderRadius: 12, padding: 12, marginBottom: 12, fontSize: 14, color: T.input.text, minHeight: 90, textAlignVertical: 'top' }} />
                <TouchableOpacity onPress={() => void handleAiProgram()} disabled={!aiPrompt.trim() || aiProgLoading}
                  className="mb-3 items-center rounded-xl bg-accent py-3" style={{ opacity: !aiPrompt.trim() || aiProgLoading ? 0.5 : 1 }}>
                  {aiProgLoading ? <ActivityIndicator size="small" color="white" /> : <Text className="font-semibold text-white">Taslak Uret</Text>}
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity onPress={() => setProgramChat([])}
                    className="flex-1 items-center rounded-xl border border-gray-200 py-3">
                    <Text className="font-medium text-muted">Temizle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowNewProgModal(false)}
                    className="flex-1 items-center rounded-xl border border-gray-200 py-3">
                    <Text className="font-medium text-muted">Kapat</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}

            {/* Manuel Sekmesi */}
            {progTab === 'manual' && (
              <>
            <TextInput value={progName} onChangeText={setProgName} placeholder="Program adı (Push Day, Bacak...)"
              placeholderTextColor="#9CA3AF" style={{ borderWidth: 1, borderColor: T.input.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: T.input.text, marginBottom: 8 }} />
            <TextInput value={progDesc} onChangeText={setProgDesc} placeholder="Açıklama (opsiyonel)"
              placeholderTextColor="#9CA3AF" style={{ borderWidth: 1, borderColor: T.input.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8, fontSize: 14, color: T.input.text, marginBottom: 12 }} />
            {progExercises.length > 0 && (
              <ScrollView className="mb-3 max-h-40">
                {progExercises.map((pe, i) => (
                  <View key={i} className="mb-1 flex-row items-center gap-2 rounded-lg border border-gray-100 px-3 py-2">
                    <Text className="flex-1 text-xs font-medium text-primary">{pe.exercise_name}</Text>
                    <Text className="text-xs text-muted">{pe.sets}×{pe.reps}</Text>
                    <TouchableOpacity onPress={() => setProgExercises((p) => p.filter((_, xi) => xi !== i))}>
                      <Text className="text-base text-muted/40">×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
            <Text className="mb-2 text-xs font-medium text-muted">Egzersiz ekle:</Text>
            <ScrollView className="mb-4 max-h-36">
              {exercises.map((ex) => (
                <TouchableOpacity key={ex.id}
                  onPress={() => setProgExercises((p) => [...p, { exercise_id: ex.id, exercise_name: ex.name, sets: 3, reps: 10, weight_kg: 0 }])}
                  className="mb-1 flex-row items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                  <Text className="text-xs font-medium text-primary">{ex.name}</Text>
                  <Text className="text-xs font-bold text-accent">+</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View className="flex-row gap-3">
              <TouchableOpacity onPress={() => setShowNewProgModal(false)} className="flex-1 items-center rounded-xl border border-gray-200 py-3">
                <Text className="font-medium text-muted">İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void handleSaveProgram()} disabled={!progName.trim() || progExercises.length === 0}
                className="flex-1 items-center rounded-xl bg-accent py-3" style={{ opacity: !progName.trim() || progExercises.length === 0 ? 0.4 : 1 }}>
                <Text className="font-semibold text-white">💾 Kaydet</Text>
              </TouchableOpacity>
            </View>
            </>
            )}
          </View>
        </View>
      </Modal>
    </GradientBackground>
  )
}
