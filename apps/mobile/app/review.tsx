import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { supabase } from '@/src/lib/supabase'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { fontSize, fontWeight, spacing, radius, palette } from '@/src/theme/tokens'
import { shiftIsoDate, toDateString, useWeeklyReview, weekStart, type BlockType, type WeekReview } from '@lifeos/shared'
import type { Translations } from '@/src/i18n'

const BAR_HEIGHT = 48

function formatMinutes(minutes: number, t: Translations) {
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  if (hours === 0) return `${rest} ${t.review_minutes}`
  return rest === 0 ? `${hours} ${t.review_hours}` : `${hours} ${t.review_hours} ${rest} ${t.review_minutes}`
}

function percent(value: number | null, lang: string) {
  if (value == null) return '-'
  const rounded = Math.round(value * 100)
  return lang === 'tr' ? `%${rounded}` : `${rounded}%`
}

function diff(current: number | null, previous: number | null): number | null {
  return current == null || previous == null ? null : current - previous
}

function typeName(type: BlockType, t: Translations) {
  const map: Record<BlockType, string> = {
    task: t.review_type_task, routine: t.review_type_routine, break: t.review_type_break,
    focus: t.review_type_focus, meal: t.review_type_meal, workout: t.review_type_workout,
  }
  return map[type]
}

function shortDate(date: string, lang: string) {
  const locale = lang === 'tr' ? 'tr-TR' : 'en-US'
  return new Date(date + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short' })
}

function dayName(date: string, lang: string) {
  const locale = lang === 'tr' ? 'tr-TR' : 'en-US'
  return new Date(date + 'T00:00:00').toLocaleDateString(locale, { weekday: 'short' })
}

function MetricCard({
  label, value, detail, delta, deltaLabel, trendColor
}: {
  label: string; value: string | number; detail?: string
  delta?: number | null; deltaLabel?: string; trendColor?: string
}) {
  const { colors } = useTheme()
  const hasDelta = delta != null
  const trend = hasDelta && delta !== 0 ? (delta > 0 ? 'up' : 'down') : 'flat'
  const trendText = hasDelta
    ? trend === 'up' ? `+${delta}` : String(delta)
    : null

  return (
    <GlassCard padding={spacing[4]} style={{ flexBasis: '47%', flexGrow: 1 }}>
      <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: colors.textSubtle, marginBottom: 2 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing[2] }}>
        <Text style={{ fontSize: fontSize.xl, fontWeight: fontWeight.extrabold, color: colors.textPrimary }}>{value}</Text>
        {trendText && (
          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: trendColor ?? (trend === 'up' ? palette.success : palette.danger), marginBottom: 2 }}>
            {trendText}
          </Text>
        )}
      </View>
      {(detail || deltaLabel) && (
        <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>
          {detail}
          {deltaLabel && detail && ' · '}
          {deltaLabel}
        </Text>
      )}
    </GlassCard>
  )
}

function Highlights({ highlights }: { highlights: string[] }) {
  const { colors } = useTheme()
  const { t } = useLang()

  if (highlights.length === 0) return null

  return (
    <GlassCard padding={spacing[4]} style={{ marginBottom: spacing[4] }}>
      <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing[3] }}>{t.review_highlights}</Text>
      <View style={{ gap: spacing[2] }}>
        {highlights.map((line, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] }}>
            <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 }}>•</Text>
            <Text style={{ fontSize: fontSize.sm, color: colors.textPrimary, flex: 1 }}>{line}</Text>
          </View>
        ))}
      </View>
    </GlassCard>
  )
}

function DayBarsSection({ days, t, lang }: { days: WeekReview['days']; t: Translations; lang: string }) {
  const { colors } = useTheme()
  const maxPlanned = Math.max(...days.map((d) => d.plannedMinutes), 1)
  const maxCompleted = Math.max(...days.map((d) => d.completedMinutes), 1)

  return (
    <GlassCard padding={spacing[4]}>
      <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing[3] }}>{t.review_by_day}</Text>
      <View style={{ gap: spacing[2] }}>
        {days.map((day) => {
          const plannedPct = (day.plannedMinutes / maxPlanned) * 100
          const completedPct = day.plannedMinutes > 0 ? (day.completedMinutes / day.plannedMinutes) * 100 : 0
          return (
            <View key={day.date} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{dayName(day.date, lang)}</Text>
                <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
                  {day.tasksCompleted} {t.review_tasks_short} · {formatMinutes(day.plannedMinutes, t)}
                </Text>
              </View>
              <View style={{ height: 8, borderRadius: radius.full, backgroundColor: colors.border, overflow: 'hidden' }}>
                <View style={{ width: `${plannedPct}%`, height: '100%', backgroundColor: colors.glassInner }} />
                <View style={{ width: `${completedPct}%`, height: '100%', backgroundColor: palette.success, position: 'absolute', top: 0, left: 0 }} />
              </View>
            </View>
          )
        })}
        <View style={{ flexDirection: 'row', gap: spacing[3], marginTop: spacing[2] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 12, height: 8, borderRadius: 2, backgroundColor: colors.glassInner }} />
            <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>{t.review_planned}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 12, height: 8, borderRadius: 2, backgroundColor: palette.success }} />
            <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>{t.review_completed_label}</Text>
          </View>
        </View>
      </View>
    </GlassCard>
  )
}

function TypeBreakdownSection({ minutesByType, t, lang }: { minutesByType: WeekReview['minutesByType']; t: Translations; lang: string }) {
  const { colors } = useTheme()

  if (minutesByType.length === 0) {
    return (
      <GlassCard padding={spacing[4]}>
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing[3] }}>{t.review_by_type}</Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' }}>{t.review_no_blocks}</Text>
      </GlassCard>
    )
  }

  const total = minutesByType.reduce((sum, m) => sum + m.planned, 0)

  return (
    <GlassCard padding={spacing[4]}>
      <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing[3] }}>{t.review_by_type}</Text>
      <View style={{ gap: spacing[2] }}>
        {minutesByType.slice(0, 6).map((entry) => {
          const pct = total > 0 ? Math.round((entry.planned / total) * 100) : 0
          const typeColor = palette[entry.type]
          return (
            <View key={entry.type} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: typeColor }} />
                  <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{typeName(entry.type, t)}</Text>
                </View>
                <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{pct}% · {formatMinutes(entry.planned, t)}</Text>
              </View>
              <View style={{ height: 6, borderRadius: radius.full, backgroundColor: colors.border, overflow: 'hidden' }}>
                <View style={{ width: `${pct}%`, height: '100%', backgroundColor: typeColor }} />
              </View>
            </View>
          )
        })}
      </View>
    </GlassCard>
  )
}

function TaskListSection({ title, tasks, empty, t }: { title: string; tasks: WeekReview['completed']; empty: string; t: Translations }) {
  const { colors } = useTheme()

  return (
    <GlassCard padding={spacing[4]}>
      <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing[3] }}>{title}</Text>
      {tasks.length === 0 ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing[4] }}>{empty}</Text>
      ) : (
        <View style={{ gap: spacing[2] }}>
          {tasks.slice(0, 8).map((task) => (
            <View key={task.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing[2] }}>
              <Text style={{ fontSize: fontSize.sm, color: colors.textPrimary, flex: 1 }}>{task.title}</Text>
            </View>
          ))}
          {tasks.length > 8 && (
            <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center', marginTop: spacing[2] }}>
              {t.review_more.replace('{n}', String(tasks.length - 8))}
            </Text>
          )}
        </View>
      )}
    </GlassCard>
  )
}

function ReviewScreen() {
  const { colors } = useTheme()
  const { lang, t } = useLang()
  const params = useLocalSearchParams<{ start?: string }>()
  const thisWeek = toDateString(weekStart(new Date()))
  // Parametre yalnızca geçmiş bir haftanın pazartesisi ise kullanılır.
  const fromParam = typeof params.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.start)
    ? toDateString(weekStart(new Date(params.start + 'T00:00:00')))
    : null
  const [start, setStart] = useState(fromParam && fromParam <= thisWeek ? fromParam : thisWeek)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  const { data, failed } = useWeeklyReview({ supabase, userId, start })

  const end = shiftIsoDate(start, 6)
  const badge = start === thisWeek ? t.review_this_week : start === shiftIsoDate(thisWeek, -7) ? t.review_last_week : null

  const format = (minutes: number) => formatMinutes(minutes, t)
  const pct = (value: number | null) => percent(value, lang)
  const vsLast = (value: string) => t.review_vs_last.replace('{value}', value)

  return (
    <ScreenBackground>
      <View style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ height: BAR_HEIGHT, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing[4] }}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary, flex: 1, textAlign: 'center' }}>{t.review_title}</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing[4], paddingBottom: spacing[10] }}
          showsVerticalScrollIndicator={false}
        >
          {/* Week selector */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[5] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
              <TouchableOpacity
                onPress={() => setStart(shiftIsoDate(start, -7))}
                activeOpacity={0.7}
                style={{ padding: spacing[2] }}
                accessibilityLabel={t.review_prev}
              >
                <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
              <View style={{ alignItems: 'center', gap: 2, flex: 1 }}>
                <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
                  {shortDate(start, lang)} - {shortDate(end, lang)}
                </Text>
                <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
                  {new Date(start + 'T00:00:00').toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', { year: 'numeric' })}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setStart(shiftIsoDate(start, 7))}
                disabled={start >= thisWeek}
                activeOpacity={0.7}
                style={{ padding: spacing[2], opacity: start >= thisWeek ? 0.4 : 1 }}
                accessibilityLabel={t.review_next}
              >
                <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {badge && (
              <View style={{ paddingHorizontal: spacing[2], paddingVertical: spacing[1], borderRadius: radius.full, backgroundColor: `${palette.accent}18`, borderWidth: 1, borderColor: `${palette.accent}35` }}>
                <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: palette.accent }}>{badge}</Text>
              </View>
            )}
          </View>

          {failed ? (
            <GlassCard padding={spacing[5]}>
              <Text style={{ fontSize: fontSize.sm, color: palette.danger, textAlign: 'center' }}>{t.review_load_error}</Text>
            </GlassCard>
          ) : !data ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing[12] }}>
              <ActivityIndicator size="large" color={palette.accent} />
              <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing[3] }}>{t.report_loading}</Text>
            </View>
          ) : (() => {
            const { current: cur, previous: prev } = data
            const topType = cur.minutesByType[0]
            const highlights = [
              cur.bestDay && t.review_best_day.replace('{day}', new Date(cur.bestDay + 'T00:00:00').toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', { weekday: 'long' })),
              topType && t.review_top_type.replace('{type}', typeName(topType.type, t).toLocaleLowerCase(lang === 'tr' ? 'tr-TR' : 'en-US')),
              cur.carryover.length > 0 && t.review_carryover_count.replace('{n}', String(cur.carryover.length)),
            ].filter((line): line is string => typeof line === 'string')

            return (
              <>
                {/* Metrics */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3], marginBottom: spacing[4] }}>
                  <MetricCard
                    label={t.review_block_time}
                    value={format(cur.completedMinutes)}
                    detail={cur.plannedMinutes > 0
                      ? t.review_planned_total.replace('{planned}', format(cur.plannedMinutes)).replace('{rate}', pct(cur.blockRate))
                      : t.review_no_blocks}
                    delta={cur.completedMinutes - prev.completedMinutes}
                    deltaLabel={vsLast(format(prev.completedMinutes))}
                    trendColor={palette.success}
                  />
                  <MetricCard
                    label={t.review_tasks_done}
                    value={String(cur.tasksCompleted)}
                    delta={cur.tasksCompleted - prev.tasksCompleted}
                    deltaLabel={vsLast(String(prev.tasksCompleted))}
                    trendColor={palette.success}
                  />
                  <MetricCard
                    label={t.review_plan_adherence}
                    value={pct(cur.scheduledRate)}
                    detail={cur.scheduledTotal > 0 ? `${cur.scheduledDone}/${cur.scheduledTotal}` : undefined}
                    delta={diff(cur.scheduledRate, prev.scheduledRate)}
                    deltaLabel={prev.scheduledRate == null ? t.review_no_previous : vsLast(pct(prev.scheduledRate))}
                    trendColor={palette.info}
                  />
                  <MetricCard
                    label={t.review_workouts}
                    value={`${cur.workoutsDone}/${cur.workoutsPlanned}`}
                    delta={cur.workoutsDone - prev.workoutsDone}
                    deltaLabel={vsLast(String(prev.workoutsDone))}
                    trendColor={palette.accent}
                  />
                  <MetricCard
                    label={t.review_meals_logged}
                    value={`${cur.loggedDays}/7`}
                    detail={cur.avgCalories == null ? undefined : t.review_avg_calories
                      .replace('{kcal}', String(Math.round(cur.avgCalories)))
                      .replace('{target}', data.calorieTarget ? String(data.calorieTarget) : '-')}
                    delta={cur.loggedDays - prev.loggedDays}
                    deltaLabel={vsLast(`${prev.loggedDays}/7`)}
                    trendColor={palette.warning}
                  />
                  <MetricCard
                    label={t.review_energy}
                    value={cur.avgEnergy == null ? '-' : `${cur.avgEnergy.toFixed(1)}/5`}
                    delta={diff(cur.avgEnergy, prev.avgEnergy)}
                    deltaLabel={prev.avgEnergy == null ? t.review_no_previous : vsLast(prev.avgEnergy.toFixed(1))}
                    trendColor={palette.success}
                  />
                </View>

                {/* Highlights */}
                <Highlights highlights={highlights} />

                {/* Day bars + Type breakdown */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3], marginBottom: spacing[4] }}>
                  <View style={{ flex: 1, minWidth: 280 }}>
                    <DayBarsSection days={cur.days} t={t} lang={lang} />
                  </View>
                  <View style={{ flex: 1, minWidth: 280 }}>
                    <TypeBreakdownSection minutesByType={cur.minutesByType} t={t} lang={lang} />
                  </View>
                </View>

                {/* Carryover + Completed */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3], marginBottom: spacing[4] }}>
                  <View style={{ flex: 1, minWidth: 280 }}>
                    <TaskListSection
                      title={`${t.review_carryover} (${cur.carryover.length})`}
                      tasks={cur.carryover}
                      empty={t.review_carryover_empty}
                      t={t}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 280 }}>
                    <TaskListSection
                      title={`${t.review_completed} (${cur.tasksCompleted})`}
                      tasks={cur.completed}
                      empty={t.review_completed_empty}
                      t={t}
                    />
                  </View>
                </View>

                {/* Go planning button */}
                <TouchableOpacity
                  onPress={() => router.push('/(tabs)/planning')}
                  activeOpacity={0.7}
                  style={{ alignItems: 'center', paddingVertical: spacing[4] }}
                >
                  <GlassCard style={{ backgroundColor: `${palette.accent}18`, borderWidth: 1, borderColor: `${palette.accent}35` }}>
                    <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.bold, color: palette.accent }}>{t.review_go_planning}</Text>
                  </GlassCard>
                </TouchableOpacity>
              </>
            )
          })()}
        </ScrollView>
      </View>
    </ScreenBackground>
  )
}

export default ReviewScreen