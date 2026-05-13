// Beslenme domain types
// Şema: supabase/migrations/002_nutrition_schema.sql

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export type FoodCategory =
  | 'protein'
  | 'carb'
  | 'fat'
  | 'vegetable'
  | 'fruit'
  | 'dairy'
  | 'grain'
  | 'beverage'
  | 'other'

export interface Macros {
  calories: number
  protein: number  // gram
  carbs: number    // gram
  fat: number      // gram
  fiber: number    // gram
}

export interface MealItem extends Macros {
  name: string
  amount: number
  unit: string      // 'g', 'ml', 'adet', 'dilim', 'yk', ...
  food_item_id?: string // food_items tablosunda match varsa
}

export interface Meal {
  id: string
  user_id: string
  date: string      // 'YYYY-MM-DD'
  meal_type: MealType
  raw_input: string | null // Kullanıcının girdiği ham metin

  items: MealItem[]

  // Toplam makrolar (items'dan hesaplanan)
  total_calories: number
  total_protein: number
  total_carbs: number
  total_fat: number
  total_fiber: number

  notes: string | null
  created_at: string
  updated_at: string
}

export interface FoodItem extends Macros {
  id: string
  user_id: string | null // NULL = global (seed data)
  name: string
  aliases: string[]
  serving_size: number
  serving_unit: string
  category: FoodCategory | null
  is_verified: boolean
  created_at: string
}

export interface NutritionTarget extends Macros {
  id: string
  user_id: string
  is_active: boolean
  // Spor günü override (opsiyonel)
  workout_day_calories: number | null
  workout_day_protein_g: number | null
  created_at: string
  updated_at: string
}

export interface MacroSummary extends Macros {
  date: string
  meal_count: number
}

export interface MacroProgress {
  current: number
  target: number
  percentage: number
  status: 'low' | 'ok' | 'over'  // < 80%: low, 80-110%: ok, > 110%: over
}

export interface DailyNutritionSummary {
  date: string
  totals: Macros
  target: NutritionTarget | null
  progress: {
    calories: MacroProgress
    protein: MacroProgress
    carbs: MacroProgress
    fat: MacroProgress
    fiber: MacroProgress
  }
  meals: Meal[]
}

// AI Parse response (parse-meal edge function)
export interface ParseMealResponse {
  items: MealItem[]
  matched_from_db: number
  estimated_by_ai: number
}

export interface CreateMealInput {
  date?: string
  meal_type: MealType
  raw_input?: string
  items?: MealItem[]
  notes?: string
}
