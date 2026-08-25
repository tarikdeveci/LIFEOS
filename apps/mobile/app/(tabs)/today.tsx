import { useEffect, useState, useCallback, useMemo } from 'react'
import { ScrollView, View, Text, TouchableOpacity, RefreshControl } from 'react-native'
import { router } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { supabase } from '@/src/lib/supabase'
import { useTaskStore, usePlanningStore, useNutritionStore, blockTiming, formatDuration, minutesOfDay, todayDate, calorieBudget } from '@lifeos/shared'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { StatCard } from '@/src/components/ui/StatCard'
import { ProgressBar } from '@/src/components/ui/ProgressBar'
import { HealthCard, HealthConnectPrompt } from '@/src/components/health/HealthCard'
import { useHealthStore } from '@/src/stores/healthStore'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { useBottomTabPadding } from '@/src/hooks/useBottomTabPadding'
import { useNow } from '@/src/hooks/useNow'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

export default function TodayScreen() {
  const { colors } = useTheme()
  const { lang, t } = useLang()
  const bottomPadding = useBottomTabPadding()
  const { tasks, fetchTasks } = useTaskStore()
  const { timeBlocks, fetchDayData } = usePlanningStore()
  const { meals, target, dailySummary, fetchDayNutrition } = useNutritionStore()
  const health = useHealthStore()
  const [userId, setUserId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // 30sn'de bir tazelenir — aktif blok ve kalan süre canlı kalsın
  const now = useNow()
  const nowMinute = minutesOfDay(now)

  // toISOString() UTC'ye çevirir: UTC+3'te gece yarısından sonra bir önceki günü
  // gösteriyordu. todayDate() yerel takvim gününü verir.
  const todayStr = todayDate()
  const locale = lang === 'tr' ? 'tr-TR' : 'en-US'
  const dateLabel = now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })

  const load = useCallback(async (uid: string) => {
    await Promise.all([
      fetchTasks(supabase, uid),
      fetchDayData(supabase, uid, todayStr),
      fetchDayNutrition(supabase, uid, todayStr),
    ])
  }, [todayStr, fetchTasks, fetchDayData, fetchDayNutrition])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id)
        void load(data.user.id)
        void health.hydrate(data.user.id)
      }
    })
    // health store referansı her render değişir; sadece mount'ta çalışmalı
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Pencereyi şu anın etrafında aç: sabahın bitmiş blokları listeyi doldurup
  // aktif bloğu ekranın dışına itiyordu.
  const { visibleBlocks, nextBlockId } = useMemo(() => {
    const sorted = todayBlocks
      .slice()
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map((block) => ({ block, timing: blockTiming(block, nowMinute) }))

    const activeIdx = sorted.findIndex((b) => b.timing.phase === 'active')
    const upcomingIdx = sorted.findIndex((b) => b.timing.phase === 'upcoming')
    const anchor = activeIdx !== -1 ? activeIdx : upcomingIdx !== -1 ? upcomingIdx : sorted.length - 1
    const start = Math.max(0, anchor - 1)

    return {
      visibleBlocks: sorted.slice(start, start + 4),
      nextBlockId: activeIdx === -1 ? (sorted[upcomingIdx]?.block.id ?? null) : null,
    }
  }, [todayBlocks, nowMinute])

  const todayMeals = meals.filter((m) => m.date === todayStr)
  const totalCal   = dailySummary?.calories ?? todayMeals.reduce((s, m) => s + (m.total_calories ?? 0), 0)
  const totalProt  = dailySummary?.protein  ?? todayMeals.reduce((s, m) => s + (m.total_protein ?? 0), 0)
  const totalCarbs = dailySummary?.carbs    ?? todayMeals.reduce((s, m) => s + (m.total_carbs ?? 0), 0)
  const totalFat   = dailySummary?.fat      ?? todayMeals.reduce((s, m) => s + (m.total_fat ?? 0), 0)

  const blockColors: Record<string, string> = {
    task: palette.task, routine: palette.routine, break: palette.break,
    focus: palette.focus, meal: palette.meal, workout: palette.workout,
  }

  // Sağlık senkronu açık ve "yakılanı bütçeye ekle" seçiliyse kalori hedefini
  // aktif kaloriyle büyüt (yediğin - yaktığın). Veri yoksa bonus 0.
  const healthEnabled = health.settings?.enabled ?? false
  const calorieTarget = calorieBudget(
    target?.calories ?? 0,
    health.today?.active_energy_kcal ?? null,
    health.settings?.add_active_energy_to_budget ?? false,
  )

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

        {/* Apple Health / Health Connect — bağlıysa özet, değilse tanıtım kartı.
            Guideline 2.5.1: HealthKit kullanımı izin öncesinde de görünür olmalı. */}
        {healthEnabled && health.settings ? (
          <HealthCard
            today={health.today}
            range={health.range}
            settings={health.settings}
            isSyncing={health.isSyncing}
            onSync={() => { if (userId) void health.sync(userId) }}
          />
        ) : (
          <HealthConnectPrompt onPress={() => router.push('/(tabs)/profile')} />
        )}

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
          {visibleBlocks.map(({ block, timing }) => {
            const color = blockColors[block.block_type] ?? palette.accent
            const isActive = timing.phase === 'active'
            const isPast = timing.phase === 'past'
            return (
              <View
                key={block.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing[3],
                  paddingVertical: 7,
                  paddingHorizontal: isActive ? spacing[2] : 0,
                  marginVertical: isActive ? 2 : 0,
                  borderRadius: radius.sm,
                  backgroundColor: isActive ? `${color}14` : 'transparent',
                  opacity: isPast ? 0.5 : 1,
                }}
              >
                <View style={{ width: isActive ? 4 : 3, height: 36, borderRadius: 2, backgroundColor: isPast ? colors.textSubtle : color }} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                    <Text
                      style={{ flex: 1, fontSize: fontSize.sm, fontWeight: isActive ? fontWeight.bold : fontWeight.medium, color: isActive ? colors.textPrimary : colors.textSecondary }}
                      numberOfLines={1}
                    >
                      {block.label}
                    </Text>
                    {isActive && (
                      <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.full, backgroundColor: color }}>
                        <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: '#fff' }}>{t.plan_now_badge}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, fontVariant: ['tabular-nums'] }}>
                    {block.start_time.slice(0, 5)} – {block.end_time.slice(0, 5)}
                    {isActive ? ` · ${formatDuration(timing.remainingMinutes, lang)} ${t.plan_remaining}` : ''}
                    {timing.phase === 'upcoming' && block.id === nextBlockId
                      ? ` · ${formatDuration(timing.minutesUntilStart, lang)} ${t.plan_starts_in}`
                      : ''}
                  </Text>
                </View>
              </View>
            )
          })}
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
                <ProgressBar label={t.today_calories} value={totalCal} target={calorieTarget.budget} unit=" kcal" color={palette.warning} />
              )}
              {calorieTarget.bonus > 0 && (
                <Text style={{ fontSize: fontSize.xs, color: palette.success, marginTop: -spacing[1] }}>
                  +{calorieTarget.bonus} {t.health_budget_bonus}
                </Text>
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
