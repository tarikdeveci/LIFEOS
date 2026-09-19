'use client'

import { useEffect, useState } from 'react'
import { fromDateString, shiftIsoDate, summarizeWeek, todayDate, type WeekReview } from '@lifeos/shared'
import {
  getBlocksForDateRange,
  getNutritionTarget,
  getPlansForDateRange,
  getTasksCompletedBetween,
  getTasksScheduledBetween,
  getWeeklyNutritionSummary,
  getWeeklyWorkoutStats,
} from '@lifeos/shared/supabase'
import { supabase } from '@/lib/supabase/client'

export interface WeeklyReviewData {
  current: WeekReview
  previous: WeekReview
  calorieTarget: number | null
}

/**
 * Seçili hafta ve bir önceki hafta için veriyi tek seferde (14 gün) çeker,
 * iki özeti aynı veriden çıkarır; karşılaştırma okları buradan gelir.
 */
export function useWeeklyReview(userId: string, start: string) {
  const [data, setData] = useState<WeeklyReviewData | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
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
  }, [userId, start])

  return { data, failed }
}
