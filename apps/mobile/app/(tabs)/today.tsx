import { useEffect, useState, useCallback } from 'react'
import { ScrollView, View, Text, TouchableOpacity, RefreshControl } from 'react-native'
import { router } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { supabase } from '@/src/lib/supabase'
import { useTaskStore, usePlanningStore, useNutritionStore } from '@lifeos/shared'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { StatCard } from '@/src/components/ui/StatCard'
import { ProgressBar } from '@/src/components/ui/ProgressBar'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { useBottomTabPadding } from '@/src/hooks/useBottomTabPadding'
import { palette, fontSize, fontWeight, spacing } from '@/src/theme/tokens'

export default function TodayScreen() {
  const { colors } = useTheme()
  const { lang, t } = useLang()
  const bottomPadding = useBottomTabPadding()
  const { tasks, fetchTasks } = useTaskStore()
  const { timeBlocks, fetchDayData } = usePlanningStore()
  const { meals, target, dailySummary, fetchDayNutrition } = useNutritionStore()
  const [userId, setUserId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const todayStr = new Date().toISOString().split('T')[0]
  const locale = lang === 'tr' ? 'tr-TR' : 'en-US'
  const dateLabel = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })

  const load = useCallback(async (uid: string) => {
    await Promise.all([
      fetchTasks(supabase, uid),
      fetchDayData(supabase, uid, todayStr),
      fetchDayNutrition(supabase, uid, todayStr),
    ])
  }, [todayStr, fetchTasks, fetchDayData, fetchDayNutrition])

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
      const [sh = 0, sm = 0] = b.start_time.split(':').map(Number)
      const [eh = 0, em = 0] = b.end_time.split(':').map(Number)
      return s + eh * 60 + em - sh * 60 - sm
    }, 0) / 60 * 10,
  ) / 10

  const todayMeals = meals.filter((m) => m.date === todayStr)
  const totalCal   = dailySummary?.calories ?? todayMeals.reduce((s, m) => s + (m.total_calories ?? 0), 0)
  const totalProt  = dailySummary?.protein  ?? todayMeals.reduce((s, m) => s + (m.total_protein ?? 0), 0)
  const totalCarbs = dailySummary?.carbs    ?? todayMeals.reduce((s, m) => s + (m.total_carbs ?? 0), 0)
  const totalFat   = dailySummary?.fat      ?? todayMeals.reduce((s, m) => s + (m.total_fat ?? 0), 0)

  const blockColors: Record<string, string> = {
    task: palette.task, routine: palette.routine, break: palette.break,
    focus: palette.focus, meal: palette.meal, workout: palette.workout,
  }

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{ padding: spacing[5], paddingBottom: bottomPadding }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={palette.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[6] }}>
          <View>
            <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: colors.textSubtle, textTransform: 'uppercase', letterSpacing: 1 }}>{t.today}</Text>
            <Text style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.textPrimary, marginTop: 2 }}>{dateLabel}</Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/profile')}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="person-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Tasks */}
        <GlassCard style={{ marginBottom: spacing[4] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[4] }}>
            <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary }}>{t.today_tasks_section}</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/tasks')}>
              <Text style={{ fontSize: fontSize.sm, color: palette.accent, fontWeight: fontWeight.semibold }}>{t.today_all}</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing[3], marginBottom: spacing[4] }}>
            <StatCard label={t.today_pending} value={todayTasks.length} color={palette.accent} />
            <StatCard label={t.today_done_count} value={doneTasks} color={palette.success} />
            <StatCard label={t.today_planned_hours} value={`${plannedHours}s`} color={palette.warning} />
          </View>
          {todayTasks.slice(0, 3).map((task) => (
            <TouchableOpacity key={task.id} onPress={() => router.push(`/task/${task.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: 6 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: palette.accent }} />
              <Text style={{ flex: 1, fontSize: fontSize.base, color: colors.textSecondary }} numberOfLines={1}>{task.title}</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textSubtle} />
            </TouchableOpacity>
          ))}
          {todayTasks.length === 0 && (
            <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle, textAlign: 'center', paddingVertical: spacing[2] }}>{t.today_no_tasks}</Text>
          )}
        </GlassCard>

        {/* Planning */}
        <GlassCard style={{ marginBottom: spacing[4] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[4] }}>
            <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary }}>{t.today_calendar}</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/planning')}>
              <Text style={{ fontSize: fontSize.sm, color: palette.accent, fontWeight: fontWeight.semibold }}>{t.today_open}</Text>
            </TouchableOpacity>
          </View>
          {todayBlocks.slice(0, 4).map((block) => (
            <View key={block.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: 7 }}>
              <View style={{ width: 3, height: 36, borderRadius: 2, backgroundColor: blockColors[block.block_type] ?? palette.accent }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textSecondary }} numberOfLines={1}>{block.label}</Text>
                <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>{block.start_time.slice(0, 5)} – {block.end_time.slice(0, 5)}</Text>
              </View>
            </View>
          ))}
          {todayBlocks.length === 0 && (
            <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle, textAlign: 'center', paddingVertical: spacing[2] }}>{t.today_no_blocks_today}</Text>
          )}
        </GlassCard>

        {/* Nutrition */}
        <GlassCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[4] }}>
            <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary }}>{t.today_nutrition}</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/nutrition')}>
              <Text style={{ fontSize: fontSize.sm, color: palette.accent, fontWeight: fontWeight.semibold }}>{t.today_open}</Text>
            </TouchableOpacity>
          </View>

          <View style={{ gap: spacing[2], marginBottom: spacing[4] }}>
            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              <StatCard label={t.today_calories} value={`${totalCal}`} color={palette.warning} />
              <StatCard label={t.nutr_protein} value={`${Math.round(totalProt)}g`} color={palette.info} />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              <StatCard label={t.nutr_carbs} value={`${Math.round(totalCarbs)}g`} color={palette.success} />
              <StatCard label={t.nutr_fat} value={`${Math.round(totalFat)}g`} color={palette.danger} />
            </View>
          </View>

          {target ? (
            <View style={{ gap: spacing[3] }}>
              {(target.calories ?? 0) > 0 && (
                <ProgressBar label={t.today_calories} value={totalCal} target={target.calories} unit=" kcal" color={palette.warning} />
              )}
              {(target.protein ?? 0) > 0 && (
                <ProgressBar label={t.nutr_protein} value={totalProt} target={target.protein} color={palette.info} />
              )}
              {(target.carbs ?? 0) > 0 && (
                <ProgressBar label={t.nutr_carbs} value={totalCarbs} target={target.carbs} color={palette.success} />
              )}
              {(target.fat ?? 0) > 0 && (
                <ProgressBar label={t.nutr_fat} value={totalFat} target={target.fat} color={palette.danger} />
              )}
            </View>
          ) : (
            <TouchableOpacity onPress={() => router.push('/(tabs)/profile')}>
              <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle, textAlign: 'center' }}>
                {t.today_set_goals}
              </Text>
            </TouchableOpacity>
          )}
        </GlassCard>
      </ScrollView>
    </ScreenBackground>
  )
}
