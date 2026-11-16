import { useEffect, useState, useCallback, useMemo } from 'react'
import { ScrollView, View, Text, TouchableOpacity, RefreshControl } from 'react-native'
import { router } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { supabase } from '@/src/lib/supabase'
import { useTaskStore, usePlanningStore, useNutritionStore, useRoutineStore, blockTiming, formatDuration, minutesOfDay, todayDate, calorieBudget } from '@lifeos/shared'
import type { Task } from '@lifeos/shared'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { ScreenHeader, HeaderIconButton } from '@/src/components/ui/ScreenHeader'
import { TaskCheckbox } from '@/src/components/ui/TaskCheckbox'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { StatCard } from '@/src/components/ui/StatCard'
import { ProgressBar } from '@/src/components/ui/ProgressBar'
import { HealthConnectPrompt } from '@/src/components/health/HealthCard'
import { NextTaskRow } from '@/src/components/tasks/NextTaskRow'
import { useHealthStore } from '@/src/stores/healthStore'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { useBottomTabPadding } from '@/src/hooks/useBottomTabPadding'
import { useNow } from '@/src/hooks/useNow'
import { useTaskCompletion } from '@/src/hooks/useTaskCompletion'
import { useProgramDays, withProgramDay } from '@/src/hooks/useProgramDays'
import { useMinimumDay } from '@/src/hooks/useMinimumDay'
import { dayPartKey } from '@/src/planning/dayPart'
import { Button } from '@/src/components/ui/Button'
import { CoachTarget } from '@/src/onboarding/coach'
import { useTodayCoach } from '@/src/onboarding/useTodayCoach'
import { palette, fontSize, fontWeight, spacing, radius, MIN_TOUCH } from '@/src/theme/tokens'

export default function TodayScreen() {
  const { colors } = useTheme()
  const { lang, t } = useLang()
  const bottomPadding = useBottomTabPadding()
  const { tasks, fetchTasks } = useTaskStore()
  // Planlama sekmesi başka güne bakarken de bugün ekranı bugünün bloklarını gösterir.
  const { todayBlocks: timeBlocks, fetchDayData } = usePlanningStore()
  const { meals, target, dailySummary, fetchDayNutrition } = useNutritionStore()
  const fetchRoutines = useRoutineStore((s) => s.fetchRoutines)
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
      // Asgari günde hangi rutinin korunduğu buradan okunur.
      fetchRoutines(supabase, uid, todayStr),
    ])
  }, [todayStr, fetchTasks, fetchDayData, fetchDayNutrition, fetchRoutines])

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

  const openTasks   = useMemo(() => tasks.filter((t) => t.scheduled_date === todayStr && t.status !== 'done'), [tasks, todayStr])
  const doneTasks   = tasks.filter((t) => t.scheduled_date === todayStr && t.status === 'done').length
  const dayBlocks   = useMemo(() => timeBlocks.filter((b) => b.date === todayStr), [timeBlocks, todayStr])
  // Asgari günde korunmayan rutinin blok ve görevleri "Bugün kapalı" altına iner (081).
  const minDay = useMinimumDay(openTasks, dayBlocks)
  const todayTasks  = minDay.active.tasks
  // Bugün'den tamamlanan görev listeden hemen düşmez: üstü çizili kalır, kutucuğa yeniden
  // dokunmak geri alır. Ekran yeniden açılınca yalnızca açık görevler görünür.
  const [justDone, setJustDone] = useState<string[]>([])
  const justDoneTasks = useMemo(
    () => tasks.filter((x) => justDone.includes(x.id) && x.scheduled_date === todayStr && x.status === 'done'),
    [tasks, justDone, todayStr],
  )
  const completeTask = useTaskCompletion()
  const toggleTask = useCallback(async (task: Task) => {
    const done = task.status !== 'done'
    if (done) setJustDone((ids) => (ids.includes(task.id) ? ids : [...ids, task.id]))
    await completeTask(task, done)
  }, [completeTask])
  const todayBlocks = minDay.active.blocks
  const programDays = useProgramDays(userId, todayBlocks)
  useTodayCoach(userId)
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
      .map((block) => {
        const timing = blockTiming(block, nowMinute)
        // Tamamlanan blok vakti gelmemiş olsa da bitmiş gibi görünür.
        return { block, timing: block.completed_at ? { ...timing, phase: 'past' as const } : timing }
      })

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
      {/* Başlık sabit: içerik kayarken tarih ve Profil/Ayarlar yerinde durur. Solda tarih,
          sağda Profil ve Ayarlar: diğer sekmelerin başlıklarıyla aynı düzen (kullanıcı isteği 2026-11-16). */}
      <ScreenHeader
        eyebrow={t.today}
        title={dateLabel}
        right={
          <>
            <HeaderIconButton icon="person-circle-outline" label={t.profile_button} onPress={() => router.push('/(tabs)/profile')} />
            <CoachTarget id="today_settings"><HeaderIconButton icon="settings-outline" label={t.settings_open} onPress={() => router.push('/(tabs)/settings' as never)} /></CoachTarget>
          </>
        }
      />
      <ScrollView
        contentContainerStyle={{ padding: spacing[5], paddingBottom: bottomPadding }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={palette.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Sağlık bağlı değilken tek satırlık tanıtım kartı (Guideline 2.5.1: HealthKit
            kullanımı izin öncesinde de ilk ekranda görünmeli). Bağlanınca veriler
            Profil'deki Aktivite ve Uyku kartında; anasayfa yalnızca sekme özetlerinden oluşur. */}
        {!(healthEnabled && health.settings) && (
          <HealthConnectPrompt onPress={() => router.push('/(tabs)/profile')} />
        )}

        {/* Tasks */}
        <CoachTarget id="today_tasks" style={{ marginBottom: spacing[4] }}><GlassCard>
          <SectionHeader title={t.today_tasks_section} linkLabel={t.today_all} onPress={() => router.push('/(tabs)/tasks')} />
          <TouchableOpacity accessible={false} activeOpacity={0.7} onPress={() => router.push('/(tabs)/tasks')} style={{ flexDirection: 'row', gap: spacing[3], marginBottom: spacing[4] }}>
            <StatCard label={t.today_pending} value={todayTasks.length} color={palette.accent} />
            <StatCard label={t.today_done_count} value={doneTasks} color={palette.success} />
            <StatCard label={t.today_planned_hours} value={`${plannedHours}${lang === 'en' ? 'h' : 's'}`} color={palette.warning} />
          </TouchableOpacity>
          {[...todayTasks.slice(0, 3), ...justDoneTasks].map((task) => {
            const isDone = task.status === 'done'
            return (
              <TouchableOpacity
                key={task.id}
                onPress={() => router.push(`/task/${task.id}` as never)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], minHeight: MIN_TOUCH }}
              >
                <TaskCheckbox done={isDone} onToggle={() => void toggleTask(task)} />
                <Text
                  style={{ flex: 1, fontSize: fontSize.base, color: isDone ? colors.textMuted : colors.textSecondary, textDecorationLine: isDone ? 'line-through' : 'none' }}
                  numberOfLines={1}
                >
                  {task.title}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={colors.textSubtle} />
              </TouchableOpacity>
            )
          })}
          {todayTasks.length === 0 && justDoneTasks.length === 0 && (
            <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle, textAlign: 'center', paddingVertical: spacing[2] }}>{t.today_no_tasks}</Text>
          )}
          {todayTasks.length === 0 && justDoneTasks.length === 0 && <NextTaskRow tasks={tasks} />}
        </GlassCard></CoachTarget>

        {/* Planning */}
        <CoachTarget id="today_calendar" style={{ marginBottom: spacing[4] }}><GlassCard>
          <SectionHeader title={t.today_calendar} linkLabel={t.today_open} onPress={() => router.push('/(tabs)/planning')} />
          <TouchableOpacity accessible={false} activeOpacity={0.7} onPress={() => router.push('/(tabs)/planning')}>
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
                      {withProgramDay(block.label ?? '', programDays[block.id])}
                    </Text>
                    {isActive && (
                      <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.full, backgroundColor: color }}>
                        <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: '#fff' }}>{t.plan_now_badge}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, fontVariant: ['tabular-nums'] }}>
                    {block.day_part ? t[dayPartKey(block.day_part)] : (<>
                    {block.start_time.slice(0, 5)} – {block.end_time.slice(0, 5)}
                    </>)}
                    {isActive ? ` · ${formatDuration(timing.remainingMinutes, lang)} ${t.plan_remaining}` : ''}
                    {timing.phase === 'upcoming' && block.id === nextBlockId
                      ? ` · ${t.plan_starts_in.replace('{d}', formatDuration(timing.minutesUntilStart, lang))}`
                      : ''}
                  </Text>
                </View>
              </View>
            )
          })}
          {todayBlocks.length === 0 && (
            <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle, textAlign: 'center', paddingVertical: spacing[2] }}>{t.today_no_blocks_today}</Text>
          )}
          </TouchableOpacity>
          <MinimumDayControls day={minDay} />
        </GlassCard></CoachTarget>

        {/* Nutrition */}
        <GlassCard>
          <SectionHeader title={t.today_nutrition} linkLabel={t.today_open} onPress={() => router.push('/(tabs)/nutrition')} />

          <TouchableOpacity accessible={false} activeOpacity={0.7} onPress={() => router.push('/(tabs)/nutrition')} style={{ gap: spacing[2], marginBottom: spacing[4] }}>
            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              <StatCard label={t.today_calories} value={`${totalCal}`} color={palette.warning} />
              <StatCard label={t.nutr_protein} value={`${Math.round(totalProt)}g`} color={palette.info} />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              <StatCard label={t.nutr_carbs} value={`${Math.round(totalCarbs)}g`} color={palette.success} />
              <StatCard label={t.nutr_fat} value={`${Math.round(totalFat)}g`} color={palette.danger} />
            </View>
          </TouchableOpacity>

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

interface SectionHeaderProps {
  title: string
  linkLabel: string
  onPress: () => void
}

/** Özet kartının başlığı: bütün satır sekmeye götürür, küçük "Aç" yazısı tek hedef değil (#3). */
function SectionHeader({ title, linkLabel, onPress }: SectionHeaderProps) {
  const { colors } = useTheme()
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${title}, ${linkLabel.replace(/\s*→$/, '')}`}
      style={{ minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[3] }}
    >
      <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary }}>{title}</Text>
      <Text style={{ fontSize: fontSize.sm, color: palette.accent, fontWeight: fontWeight.semibold }}>{linkLabel}</Text>
    </TouchableOpacity>
  )
}

interface MinimumDayControlsProps {
  day: ReturnType<typeof useMinimumDay>
}

/** Asgari gün düğmesi, kapalı kalanların soluk listesi ve korunan rutin yoksa yol gösterme. */
function MinimumDayControls({ day }: MinimumDayControlsProps) {
  const { colors } = useTheme()
  const { t } = useLang()
  if (!day.ready) return null
  // Görev bloğu ile görevi aynı başlıkla iki kez göstermemek için blokla eşleşen görev atlanır.
  const blockTaskIds = new Set(day.closed.blocks.map((b) => b.task_id).filter(Boolean))
  const closedRows = [
    ...day.closed.blocks.map((b) => ({ id: b.id, label: b.label ?? '', time: b.start_time.slice(0, 5) })),
    ...day.closed.tasks.filter((x) => !blockTaskIds.has(x.id)).map((x) => ({ id: x.id, label: x.title, time: '' })),
  ]
  return (
    <View style={{ marginTop: spacing[3], gap: spacing[2] }}>
      {day.minimum && (
        <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>{t.today_minimum_hint}</Text>
      )}
      {day.minimum && !day.hasProtected && (
        <TouchableOpacity onPress={() => router.push('/(tabs)/planning')} accessibilityRole="link" style={{ minHeight: MIN_TOUCH, justifyContent: 'center' }}>
          <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>{t.today_minimum_empty}</Text>
          <Text style={{ fontSize: fontSize.sm, color: palette.accent, fontWeight: fontWeight.semibold, marginTop: 2 }}>{t.today_minimum_go_routines}</Text>
        </TouchableOpacity>
      )}
      {day.minimum && closedRows.length > 0 && (
        <TouchableOpacity
          onPress={() => day.setShowClosed(!day.showClosed)}
          accessibilityRole="button"
          accessibilityState={{ expanded: day.showClosed }}
          style={{ minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textSubtle }}>
            {t.today_minimum_closed.replace('{n}', String(closedRows.length))}
          </Text>
          <Ionicons name={day.showClosed ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSubtle} />
        </TouchableOpacity>
      )}
      {day.minimum && day.showClosed && closedRows.map((row) => (
        <View key={row.id} style={{ flexDirection: 'row', gap: spacing[3], opacity: 0.5, paddingVertical: 4 }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, width: 40, fontVariant: ['tabular-nums'] }}>{row.time}</Text>
          <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.textSecondary }} numberOfLines={1}>{row.label}</Text>
        </View>
      ))}
      {day.failed && (
        <Text accessibilityLiveRegion="polite" style={{ fontSize: fontSize.sm, color: palette.danger }}>{t.today_minimum_error}</Text>
      )}
      <Button
        label={day.minimum ? t.today_minimum_off : t.today_minimum_on}
        onPress={() => void day.toggle()}
        loading={day.busy}
        variant="secondary"
        size="sm"
        fullWidth
      />
    </View>
  )
}
