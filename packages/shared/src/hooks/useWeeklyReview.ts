import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fromDateString, shiftIsoDate, todayDate } from '../utils/date'
import { summarizeWeek, type WeekReview } from '../utils/weeklyReview'
import {
  getBlocksForDateRange,
  getNutritionTarget,
  getPlansForDateRange,
  getTasksCompletedBetween,
  getTasksScheduledBetween,
  getWeeklyNutritionSummary,
  getWeeklyWorkoutStats,
} from '../supabase'

export interface WeeklyReviewData {
  current: WeekReview
  previous: WeekReview
  calorieTarget: number | null
}

export interface WeeklyReviewDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>
  userId: string | null
  start: string
}

export function useWeeklyReview({ supabase, userId, start }: WeeklyReviewDeps) {
  const [data, setData] = useState<WeeklyReviewData | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!userId) return

    let active = true
    setData(null)
    setFailed(false)

    void (async () => {
      const previousStart = shiftIsoDate(start, -7)
      const end = shiftIsoDate(start, 6)
      try {
        const [blocks, completed, scheduled, nutritionBefore, nutrition, workoutsBefore, workouts, plans, target] =
          await Promise.all([
            getBlocksForDateRange(supabase, userId, previousStart, end),
            getTasksCompletedBetween(
              supabase, userId,
              fromDateString(previousStart).toISOString(),
              fromDateString(shiftIsoDate(start, 7)).toISOString(),
            ),
            getTasksScheduledBetween(supabase, userId, previousStart, end),
            getWeeklyNutritionSummary(supabase, userId, previousStart),
            getWeeklyNutritionSummary(supabase, userId, start),
            getWeeklyWorkoutStats(supabase, userId, previousStart),
            getWeeklyWorkoutStats(supabase, userId, start),
            getPlansForDateRange(supabase, userId, previousStart, end),
            getNutritionTarget(supabase, userId),
          ])
        const shared = {
          today: todayDate(),
          blocks,
          completedTasks: completed,
          scheduledTasks: scheduled,
          nutrition: [...nutritionBefore, ...nutrition],
          workouts: [...workoutsBefore, ...workouts],
          plans,
        }
        if (active) {
          setData({
            current: summarizeWeek({ ...shared, start }),
            previous: summarizeWeek({ ...shared, start: previousStart }),
            calorieTarget: target?.calories ?? null,
          })
        }
      } catch {
        if (active) setFailed(true)
      }
    })()

    return () => {
      active = false
    }
  }, [supabase, userId, start])

  return { data, failed }
}
