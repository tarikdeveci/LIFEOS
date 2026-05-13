import type { Macros, MacroProgress, NutritionTarget } from '../types/nutrition'

// ============================
// TDEE / BMR hesaplama
// ============================

export type ActivityLevel =
  | 'sedentary'
  | 'lightly_active'
  | 'moderately_active'
  | 'very_active'
  | 'extra_active'

export type FitnessGoal = 'general' | 'muscle_gain' | 'fat_loss'

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: '🪑 Hareketsiz (Masabaşı)',
  lightly_active: '🚶 Hafif Aktif (1-3 gün)',
  moderately_active: '🏃 Orta Aktif (3-5 gün)',
  very_active: '💪 Çok Aktif (6-7 gün)',
  extra_active: '🔥 Ekstra Aktif (2x/gün)',
}

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
}

/**
 * Harris-Benedict formülü ile BMR hesapla, aktivite çarpanı ile TDEE üret
 */
export function calculateTDEE(params: {
  weight_kg: number
  height_cm: number
  age: number
  gender: 'male' | 'female'
  activity_level: ActivityLevel
}): number {
  const { weight_kg, height_cm, age, gender, activity_level } = params

  const bmr =
    gender === 'male'
      ? 88.362 + 13.397 * weight_kg + 4.799 * height_cm - 5.677 * age
      : 447.593 + 9.247 * weight_kg + 3.098 * height_cm - 4.33 * age

  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activity_level])
}

/**
 * TDEE ve hedefe göre makro önerisi üret
 */
export function suggestMacrosFromTDEE(
  tdee: number,
  goal: FitnessGoal,
): { calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number } {
  let calories = tdee

  if (goal === 'fat_loss') calories = Math.round(tdee * 0.8)
  if (goal === 'muscle_gain') calories = Math.round(tdee * 1.1)

  const proteinRatio = goal === 'fat_loss' ? 0.35 : goal === 'muscle_gain' ? 0.30 : 0.25
  const fatRatio = 0.25
  const carbRatio = 1 - proteinRatio - fatRatio

  return {
    calories,
    protein_g: Math.round((calories * proteinRatio) / 4),
    carbs_g: Math.round((calories * carbRatio) / 4),
    fat_g: Math.round((calories * fatRatio) / 9),
    fiber_g: goal === 'fat_loss' ? 35 : 25,
  }
}

// ============================
// Mevcut yardımcılar
// ============================

/**
 * MacroProgress hesapla (hedef vs gerçek)
 */
export function calculateMacroProgress(current: number, target: number): MacroProgress {
  const percentage = target > 0 ? Math.round((current / target) * 100) : 0

  return {
    current,
    target,
    percentage,
    status: percentage < 80 ? 'low' : percentage <= 110 ? 'ok' : 'over',
  }
}

/**
 * Makro özetini hedefle karşılaştır
 */
export function compareMacrosToTarget(
  totals: Macros,
  target: NutritionTarget,
): Record<keyof Macros, MacroProgress> {
  return {
    calories: calculateMacroProgress(totals.calories, target.calories),
    protein: calculateMacroProgress(totals.protein, target.protein),
    carbs: calculateMacroProgress(totals.carbs, target.carbs),
    fat: calculateMacroProgress(totals.fat, target.fat),
    fiber: calculateMacroProgress(totals.fiber, target.fiber),
  }
}

/**
 * Kalori kalan hesapla
 */
export function remainingCalories(currentCalories: number, targetCalories: number): number {
  return Math.max(0, targetCalories - currentCalories)
}

/**
 * Makro değerlerini topla
 */
export function sumMacros(items: Macros[]): Macros {
  return items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein: acc.protein + item.protein,
      carbs: acc.carbs + item.carbs,
      fat: acc.fat + item.fat,
      fiber: acc.fiber + item.fiber,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  )
}

/**
 * Gram → kalori dönüştürücüler (Atwater faktörleri)
 */
export const KCAL_PER_G = {
  protein: 4,
  carbs: 4,
  fat: 9,
  fiber: 2,
} as const
