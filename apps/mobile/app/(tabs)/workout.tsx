import { useEffect, useState, useCallback } from 'react'
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/src/lib/supabase'
import { callAiSuggest } from '@/src/lib/ai'
import { useWorkoutStore } from '@lifeos/shared'
import type { WorkoutSet } from '@lifeos/shared'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Input } from '@/src/components/ui/Input'
import { Button } from '@/src/components/ui/Button'
import { StatCard } from '@/src/components/ui/StatCard'
import { BottomSheet } from '@/src/components/ui/BottomSheet'
import { useTheme } from '@/src/contexts/ThemeContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

type WorkoutTab = 'today' | 'library' | 'history'

export default function WorkoutScreen() {
  const { colors } = useTheme()
  const { exercises, todayWorkout, workoutHistory, muscleGroups, fetchLibrary, fetchTodayWorkout, fetchHistory, startWorkout, finishWorkout, addSet, removeSet } = useWorkoutStore()
  const [userId, setUserId] = useState<string | null>(null)
  const [tab, setTab] = useState<WorkoutTab>('today')
  const [refreshing, setRefreshing] = useState(false)

  // Start modal
  const [showStart, setShowStart] = useState(false)
  const [workoutName, setWorkoutName] = useState('')
  const [starting, setStarting] = useState(false)

  // Add set modal
  const [showAddSet, setShowAddSet] = useState(false)
  const [setExercise, setSetExercise] = useState('')
  const [setReps, setSetReps] = useState('10')
  const [setWeight, setSetWeight] = useState('')
  const [addingSet, setAddingSet] = useState(false)

  // Finish modal
  const [showFinish, setShowFinish] = useState(false)
  const [duration, setDuration] = useState('')
  const [finishing, setFinishing] = useState(false)

  // AI
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null)

  // Library filter
  const [search, setSearch] = useState('')
  const [filterGroup, setFilterGroup] = useState<string | null>(null)

  const todayStr = new Date().toISOString().split('T')[0]

  const load = useCallback(async (uid: string) => {
    await Promise.all([fetchLibrary(supabase), fetchTodayWorkout(supabase, uid, todayStr), fetchHistory(supabase, uid)])
  }, [todayStr, fetchLibrary, fetchTodayWorkout, fetchHistory])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) { setUserId(data.user.id); void load(data.user.id) }
    })
  }, [load])

  async function handleRefresh() {
    if (!userId) return
    setRefreshing(true)
    await load(userId)
    setRefreshing(false)
  }

  async function handleStart() {
    if (!userId || !workoutName.trim()) return
    setStarting(true)
    try {
      await startWorkout(supabase, userId, { name: workoutName.trim(), date: todayStr })
      setWorkoutName('')
      setShowStart(false)
    } catch { Alert.alert('Hata', 'Antrenman başlatılamadı') }
    finally { setStarting(false) }
  }

  async function handleAddSet() {
    if (!todayWorkout || !setExercise.trim()) return
    setAddingSet(true)
    try {
      await addSet(supabase, {
        workout_id: todayWorkout.id,
        exercise_name: setExercise.trim(),
        reps: parseInt(setReps) || 10,
        weight_kg: setWeight ? parseFloat(setWeight) : undefined,
        set_number: (todayWorkout.workout_sets?.length ?? 0) + 1,
      })
      setSetExercise('')
      setSetReps('10')
      setSetWeight('')
      setShowAddSet(false)
    } catch { Alert.alert('Hata', 'Set eklenemedi') }
    finally { setAddingSet(false) }
  }

  async function handleFinish() {
    if (!todayWorkout) return
    setFinishing(true)
    try {
      await finishWorkout(supabase, todayWorkout.id, parseInt(duration) || 45)
      setShowFinish(false)
      setDuration('')
    } catch { Alert.alert('Hata', 'Antrenman tamamlanamadı') }
    finally { setFinishing(false) }
  }

  async function handleAiSuggest() {
    if (!userId) return
    setAiLoading(true)
    setAiSuggestion(null)
    try {
      const data = await callAiSuggest<{ suggestions?: Array<{ message: string }> }>({
        type: 'workout_plan',
        fitness_goal: 'muscle_gain',
        available_minutes: 60,
        energy_level: 3,
        recent_workouts: workoutHistory.slice(0, 7).map((w) => ({ name: w.name, date: w.date })),
      })
      const first = data.suggestions?.[0]
      setAiSuggestion(first?.message ?? null)
    } catch { setAiSuggestion('AI önerisi alınamadı.') }
    finally { setAiLoading(false) }
  }

  const filteredExercises = exercises.filter((e) => {
    const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase())
    const matchGroup = !filterGroup || e.muscle_group === filterGroup
    return matchSearch && matchGroup
  }).slice(0, 30)

  const TABS: { key: WorkoutTab; label: string }[] = [
    { key: 'today', label: 'Bugün' },
    { key: 'library', label: 'Kütüphane' },
    { key: 'history', label: 'Geçmiş' },
  ]

  const weekCount = workoutHistory.filter((w) => {
    const d = new Date(w.date)
    const now = new Date()
    const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
    return diff <= 7
  }).length

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{ padding: spacing[5], paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={palette.workout} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[5] }}>
          <Text style={{ fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, color: colors.textPrimary }}>Antrenman</Text>
          {tab === 'today' && !todayWorkout && (
            <TouchableOpacity onPress={() => setShowStart(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing[4], paddingVertical: 10, borderRadius: radius.full, backgroundColor: palette.workout }}>
              <Ionicons name="play" size={14} color="#fff" />
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: '#fff' }}>Başlat</Text>
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

        {/* ── TODAY TAB ── */}
        {tab === 'today' && (
          <>
            <View style={{ flexDirection: 'row', gap: spacing[3], marginBottom: spacing[4] }}>
              <StatCard label="Bu hafta" value={weekCount} color={palette.workout} />
              <StatCard label="Toplam set" value={todayWorkout?.workout_sets?.length ?? 0} color={palette.accent} />
              <StatCard label="Toplam" value={workoutHistory.length} />
            </View>

            {/* AI Suggestion */}
            {!todayWorkout && (
              <GlassCard style={{ marginBottom: spacing[4] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: aiSuggestion ? spacing[3] : 0 }}>
                  <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>AI Antrenman Önerisi</Text>
                  <TouchableOpacity
                    onPress={handleAiSuggest}
                    disabled={aiLoading}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing[3], paddingVertical: 6, borderRadius: radius.full, backgroundColor: `${palette.accent}15`, opacity: aiLoading ? 0.6 : 1 }}
                  >
                    <Ionicons name="sparkles" size={13} color={palette.accent} />
                    <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: palette.accent }}>{aiLoading ? 'Yükleniyor...' : 'Öner'}</Text>
                  </TouchableOpacity>
                </View>
                {aiSuggestion && (
                  <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 }}>{aiSuggestion}</Text>
                )}
              </GlassCard>
            )}

            {todayWorkout ? (
              <GlassCard>
                {/* Workout header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[4] }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${palette.workout}18`, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="barbell" size={20} color={palette.workout} />
                    </View>
                    <View>
                      <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary }}>{todayWorkout.name}</Text>
                      <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
                        {todayWorkout.status === 'completed' ? '✓ Tamamlandı' : '● Devam ediyor'}
                      </Text>
                    </View>
                  </View>
                  {todayWorkout.status !== 'completed' && (
                    <TouchableOpacity
                      onPress={() => setShowFinish(true)}
                      style={{ paddingHorizontal: spacing[3], paddingVertical: 7, borderRadius: radius.full, backgroundColor: `${palette.success}18`, borderWidth: 1, borderColor: `${palette.success}30` }}
                    >
                      <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: palette.success }}>Bitir</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Sets list */}
                {(todayWorkout.workout_sets?.length ?? 0) > 0 ? (
                  <View style={{ gap: spacing[2], marginBottom: spacing[4] }}>
                    {todayWorkout.workout_sets?.map((set: WorkoutSet) => (
                      <SetRow key={set.id} set={set} onDelete={() => removeSet(supabase, set.id)} />
                    ))}
                  </View>
                ) : (
                  <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle, textAlign: 'center', paddingVertical: spacing[3] }}>
                    Henüz set eklenmedi
                  </Text>
                )}

                {todayWorkout.status !== 'completed' && (
                  <Button
                    label="+ Set Ekle"
                    onPress={() => setShowAddSet(true)}
                    variant="secondary"
                    fullWidth
                  />
                )}
              </GlassCard>
            ) : (
              <View style={{ paddingTop: spacing[8], alignItems: 'center', gap: spacing[3] }}>
                <Ionicons name="barbell-outline" size={48} color={colors.textSubtle} />
                <Text style={{ fontSize: fontSize.base, color: colors.textSubtle }}>Bugün antrenman başlatılmamış</Text>
                <Button label="Antrenman başlat" onPress={() => setShowStart(true)} variant="secondary" />
              </View>
            )}
          </>
        )}

        {/* ── LIBRARY TAB ── */}
        {tab === 'library' && (
          <>
            <Input value={search} onChangeText={setSearch} placeholder="Egzersiz ara..." containerStyle={{ marginBottom: spacing[3] }} />

            {/* Muscle group filter */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing[4] }}>
              <View style={{ flexDirection: 'row', gap: spacing[2] }}>
                <TouchableOpacity
                  onPress={() => setFilterGroup(null)}
                  style={{ paddingHorizontal: spacing[3], paddingVertical: 7, borderRadius: radius.full, backgroundColor: !filterGroup ? palette.accent : colors.glassInner, borderWidth: 1, borderColor: !filterGroup ? palette.accent : colors.border }}
                >
                  <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: !filterGroup ? '#fff' : colors.textMuted }}>Tümü</Text>
                </TouchableOpacity>
                {muscleGroups.map((mg) => (
                  <TouchableOpacity
                    key={mg.id}
                    onPress={() => setFilterGroup(filterGroup === mg.name ? null : mg.name)}
                    style={{ paddingHorizontal: spacing[3], paddingVertical: 7, borderRadius: radius.full, backgroundColor: filterGroup === mg.name ? palette.workout : colors.glassInner, borderWidth: 1, borderColor: filterGroup === mg.name ? palette.workout : colors.border }}
                  >
                    <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: filterGroup === mg.name ? '#fff' : colors.textMuted }}>{mg.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={{ gap: spacing[2] }}>
              {filteredExercises.map((ex) => (
                <GlassCard key={ex.id} padding={spacing[4]} noShadow>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{ex.name}</Text>
                      <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 }}>{ex.category} · {ex.equipment}</Text>
                    </View>
                    {todayWorkout && todayWorkout.status !== 'completed' && (
                      <TouchableOpacity
                        onPress={() => { setSetExercise(ex.name); setShowAddSet(true) }}
                        style={{ paddingHorizontal: spacing[3], paddingVertical: 6, borderRadius: radius.full, backgroundColor: `${palette.workout}18`, borderWidth: 1, borderColor: `${palette.workout}30`, marginLeft: spacing[3] }}
                      >
                        <Text style={{ fontSize: fontSize.xs, color: palette.workout, fontWeight: fontWeight.semibold }}>Ekle</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </GlassCard>
              ))}
              {filteredExercises.length === 0 && (
                <Text style={{ textAlign: 'center', color: colors.textSubtle, paddingTop: spacing[8] }}>Sonuç yok</Text>
              )}
            </View>
          </>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === 'history' && (
          workoutHistory.length === 0 ? (
            <View style={{ paddingTop: spacing[8], alignItems: 'center' }}>
              <Ionicons name="time-outline" size={48} color={colors.textSubtle} />
              <Text style={{ fontSize: fontSize.base, color: colors.textSubtle, marginTop: spacing[3] }}>Geçmiş antrenman yok</Text>
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
                    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.md, backgroundColor: w.status === 'completed' ? `${palette.success}18` : `${palette.warning}18` }}>
                      <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: w.status === 'completed' ? palette.success : palette.warning }}>
                        {w.status === 'completed' ? 'Tamam' : 'Atlandı'}
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
      <BottomSheet visible={showStart} onClose={() => setShowStart(false)} title="Antrenman Başlat">
        <View style={{ gap: spacing[4] }}>
          <Input label="Antrenman adı" value={workoutName} onChangeText={setWorkoutName} placeholder="Üst beden, Bacak günü..." autoFocus />
          <Button label={starting ? 'Başlatılıyor...' : 'Başlat'} onPress={handleStart} loading={starting} fullWidth />
        </View>
      </BottomSheet>

      {/* Add set */}
      <BottomSheet visible={showAddSet} onClose={() => setShowAddSet(false)} title="Set Ekle" scrollable>
        <View style={{ gap: spacing[3] }}>
          <Input label="Egzersiz" value={setExercise} onChangeText={setSetExercise} placeholder="Bench Press, Squat..." autoFocus />
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <Input label="Tekrar" value={setReps} onChangeText={setSetReps} keyboardType="number-pad" placeholder="10" containerStyle={{ flex: 1 }} />
            <Input label="Ağırlık (kg)" value={setWeight} onChangeText={setSetWeight} keyboardType="decimal-pad" placeholder="60" containerStyle={{ flex: 1 }} />
          </View>
          <Button label={addingSet ? 'Ekleniyor...' : 'Ekle'} onPress={handleAddSet} loading={addingSet} fullWidth />
        </View>
      </BottomSheet>

      {/* Finish workout */}
      <BottomSheet visible={showFinish} onClose={() => setShowFinish(false)} title="Antrenmanı Tamamla">
        <View style={{ gap: spacing[4] }}>
          <Input label="Süre (dakika)" value={duration} onChangeText={setDuration} keyboardType="number-pad" placeholder="45" autoFocus />
          <Button label={finishing ? 'Kaydediliyor...' : 'Tamamla'} onPress={handleFinish} loading={finishing} fullWidth />
        </View>
      </BottomSheet>
    </ScreenBackground>
  )
}

function SetRow({ set, onDelete }: { set: WorkoutSet; onDelete: () => void }) {
  const { colors } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[2], borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing[3] }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: `${palette.workout}18`, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: palette.workout }}>{set.set_number}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{set.exercise_name}</Text>
        <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
          {set.reps} tekrar{set.weight_kg ? ` · ${set.weight_kg}kg` : ''}
        </Text>
      </View>
      <TouchableOpacity onPress={onDelete} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="close-circle-outline" size={18} color={colors.textSubtle} />
      </TouchableOpacity>
    </View>
  )
}
