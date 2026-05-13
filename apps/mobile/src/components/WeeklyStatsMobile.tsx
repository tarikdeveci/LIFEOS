import { useEffect, useState, useCallback } from 'react'
import { View, Text, ScrollView, ActivityIndicator } from 'react-native'
import type { SupabaseClient } from '@supabase/supabase-js'
import { todayDate, toDateString, weekStart, shiftIsoDate } from '@lifeos/shared'
import type { WeeklyDayStat } from '@lifeos/shared'
import {
  getWeeklyTaskStats,
  getWeeklyNutritionSummary,
  getWeeklyWorkoutStats,
} from '@lifeos/shared/supabase'
import { T } from '@/src/theme'

const TR_DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

const WORKOUT_COLORS: Record<string, string> = {
  completed: T.success,
  in_progress: T.warning,
  skipped: T.danger,
  none: T.card.border,
}

interface WeeklyStatsMobileProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>
  userId: string
  calorieTarget: number
}

export function WeeklyStatsMobile({ supabase, userId, calorieTarget }: WeeklyStatsMobileProps) {
  const [stats, setStats] = useState<WeeklyDayStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const today = todayDate()

  const loadStats = useCallback(async () => {
    setLoading(true)
    try {
      const weekStartDate = toDateString(weekStart(new Date()))
      const [tasksByDay, nutritionByDay, workoutsByDay] = await Promise.all([
        getWeeklyTaskStats(supabase, userId, weekStartDate),
        getWeeklyNutritionSummary(supabase, userId, weekStartDate),
        getWeeklyWorkoutStats(supabase, userId, weekStartDate),
      ])

      const data: WeeklyDayStat[] = Array.from({ length: 7 }, (_, i) => {
        const date = shiftIsoDate(weekStartDate, i)
        const taskStat = tasksByDay.find((t) => t.date === date)
        const nutritionStat = nutritionByDay.find((n) => n.date === date)
        const workoutStat = workoutsByDay.find((w) => w.date === date)

        const tasksTotal = taskStat?.total ?? 0
        const tasksCompleted = taskStat?.completed ?? 0
        const calories = nutritionStat?.calories ?? 0

        return {
          date,
          dayLabel: TR_DAYS[i] ?? date,
          tasksTotal,
          tasksCompleted,
          taskPercent: tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0,
          calories: Math.round(calories),
          caloriePercent: calorieTarget > 0 ? Math.min(100, Math.round((calories / calorieTarget) * 100)) : 0,
          workoutStatus: (workoutStat?.status ?? 'none') as WeeklyDayStat['workoutStatus'],
          caloriesBurned: workoutStat?.caloriesBurned ?? 0,
        }
      })
      setStats(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Veri yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [supabase, userId, calorieTarget])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  if (loading) {
    return (
      <View className="items-center py-6">
        <ActivityIndicator color={T.accent} />
      </View>
    )
  }

  if (error) {
    return (
      <View className="items-center py-4">
        <Text style={{ fontSize: 12, color: '#EF4444' }}>{error}</Text>
      </View>
    )
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="py-2">
      {stats.map((day) => {
        const isToday = day.date === today
        const overallScore = Math.round((day.taskPercent + day.caloriePercent + (
          day.workoutStatus === 'completed' ? 100 :
          day.workoutStatus === 'in_progress' ? 50 : 0
        )) / 3)
        const dotColor = WORKOUT_COLORS[day.workoutStatus] ?? '#E5E7EB'
        const scoreColor = overallScore >= 70 ? T.success : overallScore >= 40 ? T.warning : T.text.subtle

        return (
          <View
            key={day.date}
            className="mr-3 items-center"
            style={{ minWidth: 52 }}
          >
            {/* Gün etiketi */}
            <Text
              className="mb-1 text-xs font-medium"
              style={{ color: isToday ? T.accent : T.text.subtle }}
            >
              {day.dayLabel}
            </Text>

            {/* Skor çemberi */}
            <View
              className="mb-2 h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: day.date > today ? '#F9FAFB' : `${scoreColor}20` }}
            >
              {day.date > today ? (
                <Text className="text-xs text-gray-300">—</Text>
              ) : (
                <Text className="text-xs font-bold" style={{ color: scoreColor }}>
                  {overallScore}
                </Text>
              )}
            </View>

            {/* Görev bar */}
            <View className="mb-1 h-1 w-10 overflow-hidden rounded-full bg-gray-100">
              <View
                className="h-1 rounded-full"
                style={{
                  width: `${day.taskPercent}%`,
                  backgroundColor: T.success,
                }}
              />
            </View>

            {/* Kalori bar */}
            <View className="mb-1 h-1 w-10 overflow-hidden rounded-full bg-gray-100">
              <View
                className="h-1 rounded-full"
                style={{
                  width: `${day.caloriePercent}%`,
                  backgroundColor: T.accent,
                }}
              />
            </View>

            {/* Antrenman noktası */}
            <View
              className="mt-0.5 h-2 w-2 rounded-full"
              style={{ backgroundColor: dotColor }}
            />
          </View>
        )
      })}
    </ScrollView>
  )
}
