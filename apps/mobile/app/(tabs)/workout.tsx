import { useEffect, useState, useCallback } from 'react'
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/src/lib/supabase'
import { useWorkoutStore } from '@lifeos/shared'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Input } from '@/src/components/ui/Input'
import { Button } from '@/src/components/ui/Button'
import { StatCard } from '@/src/components/ui/StatCard'
import { BottomSheet } from '@/src/components/ui/BottomSheet'
import { useTheme } from '@/src/contexts/ThemeContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

type WorkoutTab = 'today' | 'library' | 'programs'

export default function WorkoutScreen() {
  const { colors } = useTheme()
  const { exercises, workoutSessions, fetchExercises, fetchWorkoutSessions, startWorkout } = useWorkoutStore()
  const [userId, setUserId] = useState<string | null>(null)
  const [tab, setTab] = useState<WorkoutTab>('today')
  const [refreshing, setRefreshing] = useState(false)
  const [showStart, setShowStart] = useState(false)
  const [workoutName, setWorkoutName] = useState('')
  const [starting, setStarting] = useState(false)
  const [search, setSearch] = useState('')

  const todayStr = new Date().toISOString().split('T')[0]

  const load = useCallback(async (uid: string) => {
    await Promise.all([fetchExercises(), fetchWorkoutSessions(uid)])
  }, [fetchExercises, fetchWorkoutSessions])

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
      await startWorkout(userId, { name: workoutName.trim(), date: todayStr })
      setWorkoutName('')
      setShowStart(false)
    } catch {
      Alert.alert('Hata', 'Antrenman başlatılamadı')
    } finally {
      setStarting(false)
    }
  }

  const todaySessions = workoutSessions.filter((s) => s.date === todayStr)
  const filteredExercises = search
    ? exercises.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
    : exercises.slice(0, 20)

  const TABS: { key: WorkoutTab; label: string }[] = [
    { key: 'today', label: 'Bugün' },
    { key: 'library', label: 'Kütüphane' },
    { key: 'programs', label: 'Programlar' },
  ]

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{ padding: spacing[5], paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={palette.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[5] }}>
          <Text style={{ fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, color: colors.textPrimary }}>Antrenman</Text>
          {tab === 'today' && (
            <TouchableOpacity
              onPress={() => setShowStart(true)}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: palette.workout, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="play" size={18} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {/* Tabs */}
        <View style={{ flexDirection: 'row', backgroundColor: colors.glassInner, borderRadius: radius.lg, padding: 4, marginBottom: spacing[5] }}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              style={{
                flex: 1, paddingVertical: 8, borderRadius: radius.md, alignItems: 'center',
                backgroundColor: tab === t.key ? colors.bgSurface : 'transparent',
                ...(tab === t.key ? colors.shadowCard : {}),
              }}
            >
              <Text style={{ fontSize: fontSize.sm, fontWeight: tab === t.key ? fontWeight.semibold : fontWeight.regular, color: tab === t.key ? colors.textPrimary : colors.textMuted }}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Today tab */}
        {tab === 'today' && (
          <>
            <View style={{ flexDirection: 'row', gap: spacing[3], marginBottom: spacing[4] }}>
              <StatCard label="Bugün" value={todaySessions.length} color={palette.workout} />
              <StatCard label="Bu hafta" value={workoutSessions.length} />
            </View>

            {todaySessions.length === 0 ? (
              <View style={{ paddingTop: spacing[8], alignItems: 'center', gap: spacing[3] }}>
                <Ionicons name="barbell-outline" size={48} color={colors.textSubtle} />
                <Text style={{ fontSize: fontSize.base, color: colors.textSubtle }}>Bugün antrenman yok</Text>
                <Button label="Antrenman başlat" onPress={() => setShowStart(true)} variant="secondary" />
              </View>
            ) : (
              <View style={{ gap: spacing[3] }}>
                {todaySessions.map((session) => (
                  <GlassCard key={session.id} padding={spacing[4]} noShadow>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
                      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${palette.workout}18`, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="barbell" size={20} color={palette.workout} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{session.name}</Text>
                        <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 }}>
                          {session.status === 'completed' ? 'Tamamlandı' : 'Devam ediyor'}
                        </Text>
                      </View>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: session.status === 'completed' ? palette.success : palette.warning }} />
                    </View>
                  </GlassCard>
                ))}
              </View>
            )}
          </>
        )}

        {/* Library tab */}
        {tab === 'library' && (
          <>
            <Input
              value={search}
              onChangeText={setSearch}
              placeholder="Egzersiz ara..."
              containerStyle={{ marginBottom: spacing[4] }}
            />
            <View style={{ gap: spacing[2] }}>
              {filteredExercises.map((ex) => (
                <GlassCard key={ex.id} padding={spacing[4]} noShadow>
                  <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{ex.name}</Text>
                  <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 }}>{ex.category} · {ex.equipment}</Text>
                </GlassCard>
              ))}
              {filteredExercises.length === 0 && (
                <Text style={{ textAlign: 'center', color: colors.textSubtle, paddingTop: spacing[8] }}>Sonuç yok</Text>
              )}
            </View>
          </>
        )}

        {/* Programs tab */}
        {tab === 'programs' && (
          <View style={{ paddingTop: spacing[8], alignItems: 'center', gap: spacing[3] }}>
            <Ionicons name="list-outline" size={48} color={colors.textSubtle} />
            <Text style={{ fontSize: fontSize.base, color: colors.textSubtle }}>Kayıtlı program yok</Text>
          </View>
        )}
      </ScrollView>

      {/* Start workout modal */}
      <BottomSheet visible={showStart} onClose={() => setShowStart(false)} title="Antrenman Başlat">
        <View style={{ gap: spacing[4] }}>
          <Input
            label="Antrenman adı"
            value={workoutName}
            onChangeText={setWorkoutName}
            placeholder="Üst beden, Bacak günü..."
            autoFocus
          />
          <Button label={starting ? 'Başlatılıyor...' : 'Başlat'} onPress={handleStart} loading={starting} fullWidth />
        </View>
      </BottomSheet>
    </ScreenBackground>
  )
}
