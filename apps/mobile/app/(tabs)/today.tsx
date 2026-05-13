import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, RefreshControl, ScrollView, StatusBar, Text, TouchableOpacity, View } from 'react-native'
import { router } from 'expo-router'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — @expo/vector-icons is available at runtime via Expo SDK
import { Ionicons } from '@expo/vector-icons'
import {
  todayDate,
  relativeDateLabel,
  useNutritionStore,
  usePlanningStore,
  useTaskStore,
  useWorkoutStore,
  BLOCK_TYPE_COLORS,
  BLOCK_TYPE_LABELS,
  WORKOUT_STATUS_LABELS,
} from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { GlassCard } from '@/src/components/GlassCard'
import { GradientBackground } from '@/src/components/GradientBackground'
import { WeeklyStatsMobile } from '@/src/components/WeeklyStatsMobile'
import { T } from '@/src/theme'

function timeToMinutes(t: string): number {
  const [h = 0, m = 0] = t.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}

export default function TodayScreen() {
  const date = todayDate()
  const dateLabel = relativeDateLabel(date)

  const [userId, setUserId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { timeBlocks, fetchDayData, loading: planningLoading } = usePlanningStore()
  const { tasks, fetchTasks, loading: tasksLoading } = useTaskStore()
  const { dailySummary, target: nutritionTarget, fetchDayNutrition, loading: nutritionLoading } = useNutritionStore()
  const { todayWorkout, fetchTodayWorkout, loading: workoutLoading } = useWorkoutStore()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id)
    })
    clockRef.current = setInterval(() => setNow(new Date()), 60_000)
    return () => { if (clockRef.current) clearInterval(clockRef.current) }
  }, [])

  const loadAll = useCallback(async (uid: string) => {
    try {
      await Promise.all([
        fetchDayData(supabase, uid, date),
        fetchTasks(supabase, uid, { scheduled_date: date }),
        fetchDayNutrition(supabase, uid, date),
        fetchTodayWorkout(supabase, uid, date),
      ])
    } catch {
      // stores handle their own error state
    }
  }, [date, fetchDayData, fetchDayNutrition, fetchTasks, fetchTodayWorkout])

  useEffect(() => {
    if (!userId) return
    void loadAll(userId)
  }, [userId, loadAll])

  const onRefresh = useCallback(async () => {
    if (!userId) return
    setRefreshing(true)
    await loadAll(userId)
    setRefreshing(false)
  }, [loadAll, userId])

  const openTasks = useMemo(() => tasks.filter((t) => t.status !== 'done' && t.status !== 'deferred'), [tasks])
  const doneTasks = useMemo(() => tasks.filter((t) => t.status === 'done').length, [tasks])

  const plannedMinutes = useMemo(
    () => timeBlocks.reduce((sum, block) => sum + Math.max(0, timeToMinutes(block.end_time) - timeToMinutes(block.start_time)), 0),
    [timeBlocks],
  )
  const plannedHours = Math.round((plannedMinutes / 60) * 10) / 10

  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const currentBlock = timeBlocks.find((b) => b.start_time.slice(0, 5) <= currentTime && b.end_time.slice(0, 5) > currentTime)

  const calorieTarget = nutritionTarget?.calories ?? 2000
  const caloriePercent = dailySummary ? Math.min(100, Math.round((dailySummary.calories / calorieTarget) * 100)) : 0

  return (
    <GradientBackground>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <View style={{ paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 26, fontWeight: '800', color: T.text.primary, letterSpacing: -0.5 }}>{dateLabel}</Text>
            <Text style={{ marginTop: 3, fontSize: 13, color: T.text.muted }}>
              {currentBlock ? `Simdi: ${currentBlock.label ?? BLOCK_TYPE_LABELS[currentBlock.block_type]}` : 'Bugunun genel ozeti'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/profile')}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)' }}
          >
            <Ionicons name="settings-outline" size={20} color={T.text.secondary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, paddingHorizontal: 20 }}
        contentContainerStyle={{ paddingTop: 2, paddingBottom: 112 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.accent} />}
      >
        {/* Planlama */}
        <GlassCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ fontWeight: '700', color: T.text.primary, fontSize: 13 }}>Planlama</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/planning')}>
              <Text style={{ fontSize: 12, color: T.accent, fontWeight: '700' }}>Ayrintili ac</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, borderRadius: 12, padding: 10, backgroundColor: 'rgba(99,102,241,0.08)', borderWidth: 1, borderColor: 'rgba(99,102,241,0.18)' }}>
              <Text style={{ fontSize: 11, color: T.text.subtle }}>Planli Saat</Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: T.text.primary, marginTop: 2 }}>{plannedHours}h</Text>
            </View>
            <View style={{ flex: 1, borderRadius: 12, padding: 10, backgroundColor: 'rgba(16,185,129,0.08)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.18)' }}>
              <Text style={{ fontSize: 11, color: T.text.subtle }}>Zaman Blogu</Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: T.text.primary, marginTop: 2 }}>{timeBlocks.length}</Text>
            </View>
          </View>
          {timeBlocks.length > 0 && (
            <View style={{ marginTop: 10 }}>
              {timeBlocks.slice(0, 3).map((block) => {
                const color = BLOCK_TYPE_COLORS[block.block_type]
                return (
                  <View key={block.id} style={{ marginBottom: 6, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: `${color}25`, backgroundColor: `${color}10` }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: T.text.primary }} numberOfLines={1}>{block.label ?? BLOCK_TYPE_LABELS[block.block_type]}</Text>
                    <Text style={{ fontSize: 10, color: T.text.subtle, marginTop: 1 }}>{block.start_time.slice(0, 5)}-{block.end_time.slice(0, 5)}</Text>
                  </View>
                )
              })}
            </View>
          )}
          {planningLoading && <ActivityIndicator style={{ marginTop: 8 }} size="small" color={T.accent} />}
        </GlassCard>

        {/* Görevler */}
        <GlassCard>
          <Text style={{ fontWeight: '700', color: T.text.primary, fontSize: 13, marginBottom: 10 }}>Gorevler</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, borderRadius: 12, padding: 10, backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.18)' }}>
              <Text style={{ fontSize: 11, color: T.text.subtle }}>Acik</Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: T.text.primary, marginTop: 2 }}>{openTasks.length}</Text>
            </View>
            <View style={{ flex: 1, borderRadius: 12, padding: 10, backgroundColor: 'rgba(16,185,129,0.08)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.18)' }}>
              <Text style={{ fontSize: 11, color: T.text.subtle }}>Tamamlanan</Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: T.text.primary, marginTop: 2 }}>{doneTasks}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => router.push('/(tabs)/tasks')} style={{ marginTop: 10 }}>
            <Text style={{ fontSize: 12, color: T.accent, fontWeight: '700' }}>Gorevlere git</Text>
          </TouchableOpacity>
          {tasksLoading && <ActivityIndicator style={{ marginTop: 8 }} size="small" color={T.accent} />}
        </GlassCard>

        {/* Beslenme */}
        <GlassCard>
          <Text style={{ fontWeight: '700', color: T.text.primary, fontSize: 13, marginBottom: 10 }}>Beslenme</Text>
          {nutritionLoading ? (
            <ActivityIndicator size="small" color={T.accent} />
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 28, fontWeight: '800', color: T.text.primary }}>{Math.round(dailySummary?.calories ?? 0)}</Text>
                <Text style={{ fontSize: 12, color: T.text.muted }}>/ {calorieTarget} kcal</Text>
              </View>
              <View style={{ marginTop: 8, height: 6, borderRadius: 6, overflow: 'hidden', backgroundColor: 'rgba(15,23,42,0.06)' }}>
                <View style={{ height: 6, borderRadius: 6, backgroundColor: T.accent, width: `${caloriePercent}%` }} />
              </View>
              <TouchableOpacity onPress={() => router.push('/(tabs)/nutrition')} style={{ marginTop: 10 }}>
                <Text style={{ fontSize: 12, color: T.accent, fontWeight: '700' }}>Beslenmeye git</Text>
              </TouchableOpacity>
            </>
          )}
        </GlassCard>

        {/* Antrenman */}
        <GlassCard>
          <Text style={{ fontWeight: '700', color: T.text.primary, fontSize: 13, marginBottom: 10 }}>Antrenman</Text>
          {workoutLoading ? (
            <ActivityIndicator size="small" color={T.accent} />
          ) : todayWorkout ? (
            <>
              <Text style={{ fontSize: 14, fontWeight: '700', color: T.text.primary }}>{todayWorkout.name ?? 'Antrenman'}</Text>
              <Text style={{ fontSize: 12, color: T.text.subtle, marginTop: 4 }}>{WORKOUT_STATUS_LABELS[todayWorkout.status]}</Text>
            </>
          ) : (
            <Text style={{ fontSize: 13, color: T.text.muted }}>Bugun antrenman yok</Text>
          )}
          <TouchableOpacity onPress={() => router.push('/(tabs)/workout')} style={{ marginTop: 10 }}>
            <Text style={{ fontSize: 12, color: T.accent, fontWeight: '700' }}>Antrenmana git</Text>
          </TouchableOpacity>
        </GlassCard>

        {/* Bu Hafta */}
        {userId && (
          <GlassCard marginBottom={32}>
            <Text style={{ marginBottom: 12, fontWeight: '700', color: T.text.primary, fontSize: 13 }}>Bu Hafta</Text>
            <WeeklyStatsMobile supabase={supabase} userId={userId} calorieTarget={calorieTarget} />
          </GlassCard>
        )}
      </ScrollView>
    </GradientBackground>
  )
}
