import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'
import { todayDate, toDateString } from '../utils/date'
import type {
  Meal,
  FoodItem,
  NutritionTarget,
  MacroSummary,
  CreateMealInput,
  Macros,
} from '../types/nutrition'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any>
type MealInsert = Database['public']['Tables']['meals']['Insert']
type MealUpdate = Database['public']['Tables']['meals']['Update']
type FoodItemInsert = Database['public']['Tables']['food_items']['Insert']
interface MealTotals {
  total_calories: number
  total_protein: number
  total_carbs: number
  total_fat: number
  total_fiber: number
}

export async function getMealsByDate(
  supabase: Supabase,
  userId: string,
  date: string,
): Promise<Meal[]> {
  const { data, error } = await supabase
    .from('meals')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .order('created_at')

  if (error) throw error
  return data as unknown as Meal[]
}

export async function createMeal(
  supabase: Supabase,
  userId: string,
  input: CreateMealInput,
): Promise<Meal> {
  const items = input.items ?? []
  const totals = calculateTotals(items)
  const serializedItems = items.map((item) => ({ ...item })) as unknown as import('../types/database').Json
  const resolvedDate = input.date ?? todayDate()
  const payload: MealInsert = {
    user_id: userId,
    meal_type: input.meal_type,
    raw_input: input.raw_input ?? null,
    items: serializedItems,
    notes: input.notes ?? null,
    ...totals,
  }
  if (resolvedDate) payload.date = resolvedDate

  const { data, error } = await supabase
    .from('meals')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return data as unknown as Meal
}

export async function updateMeal(
  supabase: Supabase,
  mealId: string,
  updates: Partial<CreateMealInput>,
): Promise<Meal> {
  const payload: MealUpdate = {}

  if (updates.date !== undefined) payload.date = updates.date
  if (updates.meal_type !== undefined) payload.meal_type = updates.meal_type
  if (updates.raw_input !== undefined) payload.raw_input = updates.raw_input
  if (updates.notes !== undefined) payload.notes = updates.notes

  if (updates.items) {
    const totals = calculateTotals(updates.items)
    payload.items = updates.items.map((item) => ({ ...item })) as unknown as import('../types/database').Json
    payload.total_calories = totals.total_calories
    payload.total_protein = totals.total_protein
    payload.total_carbs = totals.total_carbs
    payload.total_fat = totals.total_fat
    payload.total_fiber = totals.total_fiber
  }

  const { data, error } = await supabase
    .from('meals')
    .update(payload)
    .eq('id', mealId)
    .select()
    .single()

  if (error) throw error
  return data as unknown as Meal
}

export async function deleteMeal(supabase: Supabase, mealId: string): Promise<void> {
  const { error } = await supabase.from('meals').delete().eq('id', mealId)
  if (error) throw error
}

export async function getNutritionTarget(
  supabase: Supabase,
  userId: string,
): Promise<NutritionTarget | null> {
  const { data, error } = await supabase
    .from('nutrition_targets')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  if (!data) return null

  // DB columns use _g suffix (protein_g, carbs_g, fat_g, fiber_g)
  // but TypeScript NutritionTarget extends Macros expects (protein, carbs, fat, fiber)
  const row = data as Record<string, unknown>
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    calories: row.calories as number,
    protein: (row.protein_g ?? row.protein ?? 0) as number,
    carbs: (row.carbs_g ?? row.carbs ?? 0) as number,
    fat: (row.fat_g ?? row.fat ?? 0) as number,
    fiber: (row.fiber_g ?? row.fiber ?? 0) as number,
    is_active: row.is_active as boolean,
    workout_day_calories: (row.workout_day_calories ?? null) as number | null,
    workout_day_protein_g: (row.workout_day_protein_g ?? null) as number | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

export async function getDailySummary(
  supabase: Supabase,
  userId: string,
  date: string,
): Promise<MacroSummary> {
  const { data, error } = await supabase
    .from('meals')
    .select('total_calories, total_protein, total_carbs, total_fat, total_fiber')
    .eq('user_id', userId)
    .eq('date', date)

  if (error) throw error

  const meals = data as unknown as Array<{
    total_calories: number
    total_protein: number
    total_carbs: number
    total_fat: number
    total_fiber: number
  }>

  return {
    date,
    meal_count: meals.length,
    calories: meals.reduce((s, m) => s + m.total_calories, 0),
    protein: meals.reduce((s, m) => s + m.total_protein, 0),
    carbs: meals.reduce((s, m) => s + m.total_carbs, 0),
    fat: meals.reduce((s, m) => s + m.total_fat, 0),
    fiber: meals.reduce((s, m) => s + m.total_fiber, 0),
  }
}

export async function searchFoodItems(
  supabase: Supabase,
  query: string,
  userId: string,
): Promise<FoodItem[]> {
  const q = query.toLowerCase().trim()
  const userFilter = `user_id.is.null,user_id.eq.${userId}`

  // Name ile arama (ilike)
  const { data: byName } = await supabase
    .from('food_items')
    .select('*')
    .or(userFilter)
    .ilike('name', `%${q}%`)
    .order('is_verified', { ascending: false })
    .limit(15)

  // Aliases ile arama (exact element match)
  const { data: byAlias } = await supabase
    .from('food_items')
    .select('*')
    .or(userFilter)
    .contains('aliases', [q])
    .order('is_verified', { ascending: false })
    .limit(10)

  // Birleştir, tekrarları çıkar, name'e göre sırala
  const seen = new Set<string>()
  const results: FoodItem[] = []
  for (const item of [...(byName ?? []), ...(byAlias ?? [])]) {
    if (!seen.has(item.id)) {
      seen.add(item.id)
      results.push(item as unknown as FoodItem)
    }
  }
  return results.slice(0, 20)
}

export async function createFoodItem(
  supabase: Supabase,
  userId: string,
  item: Omit<FoodItem, 'id' | 'user_id' | 'is_verified' | 'created_at'>,
): Promise<FoodItem> {
  const payload: FoodItemInsert = { ...item, user_id: userId, is_verified: false }
  const { data, error } = await supabase
    .from('food_items')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return data as unknown as FoodItem
}

export async function getWeeklyNutritionSummary(
  supabase: Supabase,
  userId: string,
  startDate: string,
): Promise<MacroSummary[]> {
  const [y, m, d] = startDate.split('-').map(Number) as [number, number, number]
  const endDate = toDateString(new Date(y, m - 1, d + 6))

  const { data, error } = await supabase
    .from('meals')
    .select('date, total_calories, total_protein, total_carbs, total_fat, total_fiber')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)

  if (error) throw error

  // Güne göre grupla
  const byDate = new Map<string, MacroSummary>()
  for (const meal of data as unknown as Array<{
    date: string
    total_calories: number
    total_protein: number
    total_carbs: number
    total_fat: number
    total_fiber: number
  }>) {
    const existing = byDate.get(meal.date) ?? {
      date: meal.date,
      meal_count: 0,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
    }
    byDate.set(meal.date, {
      date: meal.date,
      meal_count: existing.meal_count + 1,
      calories: existing.calories + meal.total_calories,
      protein: existing.protein + meal.total_protein,
      carbs: existing.carbs + meal.total_carbs,
      fat: existing.fat + meal.total_fat,
      fiber: existing.fiber + meal.total_fiber,
    })
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}

// Internal helper
function calculateTotals(
  items: Array<{ calories: number; protein: number; carbs: number; fat: number; fiber: number }>,
): MealTotals {
  return {
    total_calories: items.reduce((s, i) => s + i.calories, 0),
    total_protein: items.reduce((s, i) => s + i.protein, 0),
    total_carbs: items.reduce((s, i) => s + i.carbs, 0),
    total_fat: items.reduce((s, i) => s + i.fat, 0),
    total_fiber: items.reduce((s, i) => s + i.fiber, 0),
  }
}
