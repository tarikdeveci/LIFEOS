import { useEffect, useState, useCallback } from 'react'
import { ScrollView, View, Text, TouchableOpacity, RefreshControl } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/src/lib/supabase'
import { useTaskStore, usePlanningStore, useNutritionStore } from '@lifeos/shared'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { StatCard } from '@/src/components/ui/StatCard'
import { ProgressBar } from '@/src/components/ui/ProgressBar'
import { useTheme } from '@/src/contexts/ThemeContext'
import { palette, fontSize, fontWeight, spacing } from '@/src/theme/tokens'

export default function TodayScreen() {
  const { colors } = useTheme()
  const { tasks, fetchTasks } = useTaskStore()
  const { timeBlocks, fetchTimeBlocks } = usePlanningStore()
  const { meals, nutritionTargets, fetchMeals, fetchNutritionTargets } = useNutritionStore()
  const [userId, setUserId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const dateLabel = today.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })

  const load = useCallback(async (uid: string) => {
    await Promise.all([
      fetchTasks(uid, {}),
      fetchTimeBlocks(uid, todayStr),
      fetchMeals(uid, todayStr),
      fetchNutritionTargets(uid),
    ])
  }, [todayStr, fetchTasks, fetchTimeBlocks, fetchMeals, fetchNutritionTargets])

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

  const todayTasks  = tasks.filter((t) => t.scheduled_date === todayStr && t.status !== 'done')
  const doneTasks   = tasks.filter((t) => t.scheduled_date === todayStr && t.status === 'done').length
  const todayBlocks = timeBlocks.filter((b) => b.date === todayStr)
  const plannedHours = Math.round(
    todayBlocks.reduce((s, b) => {
      const [sh, sm] = b.start_time.split(':').map(Number)
      const [eh, em] = b.end_time.split(':').map(Number)
      return s + eh * 60 + em - sh * 60 - sm
    }, 0) / 60 * 10,
  ) / 10

  const todayMeals = meals.filter((m) => m.date === todayStr)
  const totalCal   = todayMeals.reduce((s, m) => s + (m.total_calories ?? 0), 0)
  const totalProt  = todayMeals.reduce((s, m) => s + (m.total_protein ?? 0), 0)
  const target     = nutritionTargets?.[0]

  const blockColors: Record<string, string> = {
    task: palette.task, routine: palette.routine, break: palette.break,
    focus: palette.focus, meal: palette.meal, workout: palette.workout,
  }

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{ padding: spacing[5], paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={palette.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[6] }}>
          <View>
            <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: colors.textSubtle, textTransform: 'uppercase', letterSpacing: 1 }}>
              Bugün
            </Text>
            <Text style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.textPrimary, marginTop: 2 }}>
              {dateLabel}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/profile')}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="person-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Tasks card */}
        <GlassCard style={{ marginBottom: spacing[4] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[4] }}>
            <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary }}>Görevler</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/tasks')}>
              <Text style={{ fontSize: fontSize.sm, color: palette.accent, fontWeight: fontWeight.semibold }}>Tümü →</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing[3], marginBottom: spacing[4] }}>
            <StatCard label="Bekleyen" value={todayTasks.length} color={palette.accent} />
            <StatCard label="Tamam" value={doneTasks} color={palette.success} />
            <StatCard label="Planlandı" value={`${plannedHours}s`} color={palette.warning} />
          </View>
          {todayTasks.slice(0, 3).map((task) => (
            <TouchableOpacity
              key={task.id}
              onPress={() => router.push(`/task/${task.id}` as never)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: 6 }}
            >
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: palette.accent }} />
              <Text style={{ flex: 1, fontSize: fontSize.base, color: colors.textSecondary }} numberOfLines={1}>
                {task.title}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textSubtle} />
            </TouchableOpacity>
          ))}
          {todayTasks.length === 0 && (
            <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle, textAlign: 'center', paddingVertical: spacing[2] }}>
              Bugün için görev yok 🎉
            </Text>
          )}
        </GlassCard>

        {/* Planning card */}
        <GlassCard style={{ marginBottom: spacing[4] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[4] }}>
            <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary }}>Takvim</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/planning')}>
              <Text style={{ fontSize: fontSize.sm, color: palette.accent, fontWeight: fontWeight.semibold }}>Aç →</Text>
            </TouchableOpacity>
          </View>
          {todayBlocks.slice(0, 4).map((block) => (
            <View key={block.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: 7 }}>
              <View style={{ width: 3, height: 36, borderRadius: 2, backgroundColor: blockColors[block.block_type] ?? palette.accent }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textSecondary }} numberOfLines={1}>
                  {block.label}
                </Text>
                <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>
                  {block.start_time.slice(0, 5)} – {block.end_time.slice(0, 5)}
                </Text>
              </View>
            </View>
          ))}
          {todayBlocks.length === 0 && (
            <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle, textAlign: 'center', paddingVertical: spacing[2] }}>
              Bugün için blok eklenmemiş
            </Text>
          )}
        </GlassCard>

        {/* Nutrition card */}
        <GlassCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[4] }}>
            <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary }}>Beslenme</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/nutrition')}>
              <Text style={{ fontSize: fontSize.sm, color: palette.accent, fontWeight: fontWeight.semibold }}>Aç →</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing[3], marginBottom: target ? spacing[4] : 0 }}>
            <StatCard label="Kalori" value={`${totalCal}`} color={palette.warning} />
            <StatCard label="Protein" value={`${totalProt}g`} color={palette.info} />
          </View>
          {target && (
            <View style={{ gap: spacing[3] }}>
              <ProgressBar label="Kalori" value={totalCal} target={target.calories} unit=" kcal" color={palette.warning} />
              <ProgressBar label="Protein" value={totalProt} target={target.protein_g} color={palette.info} />
            </View>
          )}
        </GlassCard>
      </ScrollView>
    </ScreenBackground>
  )
}
