import { useEffect, useState, useCallback } from 'react'
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/src/lib/supabase'
import { callAiSuggest } from '@/src/lib/ai'
import { useWorkoutStore } from '@lifeos/shared'
import type { Exercise, WorkoutSet } from '@lifeos/shared'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Input } from '@/src/components/ui/Input'
import { Button } from '@/src/components/ui/Button'
import { StatCard } from '@/src/components/ui/StatCard'
import { BottomSheet } from '@/src/components/ui/BottomSheet'
import { useTheme } from '@/src/contexts/ThemeContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

type WorkoutTab = 'today' | 'library' | 'history'

const CATEGORY_LABELS: Record<string, string> = {
  strength: 'Kuvvet', cardio: 'Kardiyo', flexibility: 'Esneklik', mobility: 'Hareketlilik',
}

export default function WorkoutScreen() {
  const { colors } = useTheme()
  const { exercises, muscleGroups, todayWorkout, workoutHistory, fetchLibrary, fetchTodayWorkout, fetchHistory, startWorkout, finishWorkout, addSet, removeSet } = useWorkoutStore()
  const [userId, setUserId] = useState<string | null>(null)
  const [tab, setTab] = useState<WorkoutTab>('today')
  const [refreshing, setRefreshing] = useState(false)

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

  // AI
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null)

  // Library search + filter
  const [search, setSearch] = useState('')
  const [filterGroupId, setFilterGroupId] = useState<number | null>(null)

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
    setRefreshing(true); await load(userId); setRefreshing(false)
  }

  async function handleStart() {
    if (!userId || !workoutName.trim()) return
    setStarting(true)
    try {
      await startWorkout(supabase, userId, { name: workoutName.trim(), date: todayStr })
      setWorkoutName(''); setShowStart(false)
    } catch { Alert.alert('Hata', 'Antrenman başlatılamadı') }
    finally { setStarting(false) }
  }

  async function handleAddSet() {
    if (!todayWorkout || !selectedExercise) return
    setAddingSet(true)
    try {
      await addSet(supabase, {
        workout_id: todayWorkout.id,
        exercise_id: selectedExercise.id,
        reps: parseInt(setReps) || 10,
        weight_kg: setWeight ? parseFloat(setWeight) : undefined,
        set_number: (todayWorkout.workout_sets?.length ?? 0) + 1,
      })
      setSelectedExercise(null); setSetReps('10'); setSetWeight('')
    } catch { Alert.alert('Hata', 'Set eklenemedi') }
    finally { setAddingSet(false) }
  }

  async function handleFinish() {
    if (!todayWorkout) return
    setFinishing(true)
    try {
      await finishWorkout(supabase, todayWorkout.id, parseInt(duration) || 45)
      setShowFinish(false); setDuration('')
    } catch { Alert.alert('Hata', 'Antrenman tamamlanamadı') }
    finally { setFinishing(false) }
  }

  async function handleAiSuggest() {
    setAiLoading(true); setAiSuggestion(null)
    try {
      const data = await callAiSuggest<{ suggestions?: Array<{ message: string }> }>({
        type: 'workout_plan', fitness_goal: 'muscle_gain', available_minutes: 60, energy_level: 3,
        recent_workouts: workoutHistory.slice(0, 7).map((w) => ({ name: w.name, date: w.date })),
      })
      setAiSuggestion(data.suggestions?.[0]?.message ?? null)
    } catch { setAiSuggestion('AI önerisi alınamadı.') }
    finally { setAiLoading(false) }
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
    { key: 'today', label: 'Bugün' },
    { key: 'library', label: 'Kütüphane' },
    { key: 'history', label: 'Geçmiş' },
  ]

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

        {/* ── TODAY ── */}
        {tab === 'today' && (
          <>
            <View style={{ flexDirection: 'row', gap: spacing[3], marginBottom: spacing[4] }}>
              <StatCard label="Bu hafta" value={weekCount} color={palette.workout} />
              <StatCard label="Bugün set" value={todayWorkout?.workout_sets?.length ?? 0} color={palette.accent} />
              <StatCard label="Toplam" value={workoutHistory.length} />
            </View>

            {!todayWorkout && (
              <GlassCard style={{ marginBottom: spacing[4] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: aiSuggestion ? spacing[3] : 0 }}>
                  <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>AI Antrenman Önerisi</Text>
                  <TouchableOpacity onPress={handleAiSuggest} disabled={aiLoading} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing[3], paddingVertical: 6, borderRadius: radius.full, backgroundColor: `${palette.accent}15`, opacity: aiLoading ? 0.6 : 1 }}>
                    <Ionicons name="sparkles" size={13} color={palette.accent} />
                    <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: palette.accent }}>{aiLoading ? 'Yükleniyor...' : 'Öner'}</Text>
                  </TouchableOpacity>
                </View>
                {aiSuggestion && <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 }}>{aiSuggestion}</Text>}
              </GlassCard>
            )}

            {todayWorkout ? (
              <GlassCard>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[4] }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${palette.workout}18`, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="barbell" size={20} color={palette.workout} />
                    </View>
                    <View>
                      <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary }}>{todayWorkout.name}</Text>
                      <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
                        {todayWorkout.status === 'completed' ? '✓ Tamamlandı' : `● Devam · ${todayWorkout.workout_sets?.length ?? 0} set`}
                      </Text>
                    </View>
                  </View>
                  {todayWorkout.status !== 'completed' && (
                    <TouchableOpacity onPress={() => setShowFinish(true)} style={{ paddingHorizontal: spacing[3], paddingVertical: 7, borderRadius: radius.full, backgroundColor: `${palette.success}18`, borderWidth: 1, borderColor: `${palette.success}30` }}>
                      <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: palette.success }}>Bitir</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {(todayWorkout.workout_sets?.length ?? 0) > 0 ? (
                  <View style={{ gap: 2, marginBottom: spacing[4] }}>
                    {todayWorkout.workout_sets?.map((set: WorkoutSet) => (
                      <SetRow key={set.id} set={set} onDelete={() => removeSet(supabase, set.id)} />
                    ))}
                  </View>
                ) : (
                  <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle, textAlign: 'center', paddingVertical: spacing[3] }}>Kütüphaneden egzersiz seçip set ekle</Text>
                )}

                {todayWorkout.status !== 'completed' && (
                  <TouchableOpacity onPress={() => setTab('library')} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: radius.lg, backgroundColor: `${palette.workout}12`, borderWidth: 1, borderColor: `${palette.workout}25` }}>
                    <Ionicons name="search-outline" size={16} color={palette.workout} />
                    <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.workout }}>Kütüphaneden Egzersiz Seç</Text>
                  </TouchableOpacity>
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
                    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.md, backgroundColor: w.status === 'completed' ? `${palette.success}18` : `${palette.warning}18` }}>
                      <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: w.status === 'completed' ? palette.success : palette.warning }}>
                        {w.status === 'completed' ? '✓ Tamam' : 'Atlandı'}
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
    </ScreenBackground>
  )
}

function SetRow({ set, onDelete }: { set: WorkoutSet; onDelete: () => void }) {
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
      <TouchableOpacity onPress={onDelete} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="close-circle-outline" size={18} color={colors.textSubtle} />
      </TouchableOpacity>
    </View>
  )
}
