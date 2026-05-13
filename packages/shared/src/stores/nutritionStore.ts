import { create } from 'zustand'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'
import type {
  Meal,
  NutritionTarget,
  MacroSummary,
  CreateMealInput,
} from '../types/nutrition'
import {
  getMealsByDate,
  createMeal,
  updateMeal,
  deleteMeal,
  getNutritionTarget,
  getDailySummary,
} from '../supabase/nutrition'
import { todayDate } from '../utils/date'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any>

interface NutritionState {
  date: string
  meals: Meal[]
  target: NutritionTarget | null
  dailySummary: MacroSummary | null
  loading: boolean
  error: string | null

  // Actions
  fetchDayNutrition: (supabase: Supabase, userId: string, date?: string) => Promise<void>
  addMeal: (supabase: Supabase, userId: string, input: CreateMealInput) => Promise<Meal>
  editMeal: (supabase: Supabase, mealId: string, updates: Partial<CreateMealInput>) => Promise<void>
  removeMeal: (supabase: Supabase, mealId: string) => Promise<void>

  // Realtime handler
  handleRealtimeEvent: (event: { eventType: string; new: unknown; old: unknown }) => void
}

export const useNutritionStore = create<NutritionState>((set, get) => ({
  date: todayDate(),
  meals: [],
  target: null,
  dailySummary: null,
  loading: false,
  error: null,

  fetchDayNutrition: async (supabase, userId, date = todayDate()) => {
    set({ loading: true, error: null, date })
    try {
      const [meals, target, dailySummary] = await Promise.all([
        getMealsByDate(supabase, userId, date),
        getNutritionTarget(supabase, userId),
        getDailySummary(supabase, userId, date),
      ])
      set({ meals, target, dailySummary, loading: false })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Hata', loading: false })
    }
  },

  addMeal: async (supabase, userId, input) => {
    const meal = await createMeal(supabase, userId, input)
    set((state) => {
      const newSummary = state.dailySummary
        ? {
            ...state.dailySummary,
            meal_count: state.dailySummary.meal_count + 1,
            calories: state.dailySummary.calories + meal.total_calories,
            protein: state.dailySummary.protein + meal.total_protein,
            carbs: state.dailySummary.carbs + meal.total_carbs,
            fat: state.dailySummary.fat + meal.total_fat,
            fiber: state.dailySummary.fiber + meal.total_fiber,
          }
        : null
      return { meals: [...state.meals, meal], dailySummary: newSummary }
    })
    // Background refresh to sync with server-computed totals
    get().fetchDayNutrition(supabase, userId, get().date).catch((err: unknown) => {
      console.error('Nutrition refresh failed:', err)
    })
    return meal
  },

  editMeal: async (supabase, mealId, updates) => {
    const prevMeals = get().meals
    set((state) => ({
      meals: state.meals.map((m) => (m.id === mealId ? { ...m, ...updates } : m)),
    }))
    try {
      await updateMeal(supabase, mealId, updates)
    } catch (err) {
      set({ meals: prevMeals })
      throw err
    }
  },

  removeMeal: async (supabase, mealId) => {
    const removedMeal = get().meals.find((m) => m.id === mealId)
    const prevMeals = get().meals
    const prevSummary = get().dailySummary
    set((state) => {
      const newSummary =
        removedMeal && state.dailySummary
          ? {
              ...state.dailySummary,
              meal_count: state.dailySummary.meal_count - 1,
              calories: state.dailySummary.calories - removedMeal.total_calories,
              protein: state.dailySummary.protein - removedMeal.total_protein,
              carbs: state.dailySummary.carbs - removedMeal.total_carbs,
              fat: state.dailySummary.fat - removedMeal.total_fat,
              fiber: state.dailySummary.fiber - removedMeal.total_fiber,
            }
          : state.dailySummary
      return { meals: state.meals.filter((m) => m.id !== mealId), dailySummary: newSummary }
    })
    try {
      await deleteMeal(supabase, mealId)
    } catch (err) {
      set({ meals: prevMeals, dailySummary: prevSummary })
      throw err
    }
  },

  handleRealtimeEvent: (event) => {
    const { eventType, new: newRecord, old: oldRecord } = event
    const { meals } = get()

    if (eventType === 'INSERT') {
      const meal = newRecord as Meal
      if (!meals.find((m) => m.id === meal.id)) {
        set({ meals: [...meals, meal] })
      }
    } else if (eventType === 'UPDATE') {
      const meal = newRecord as Meal
      set({ meals: meals.map((m) => (m.id === meal.id ? { ...m, ...meal } : m)) })
    } else if (eventType === 'DELETE') {
      const deleted = oldRecord as { id: string }
      set({ meals: meals.filter((m) => m.id !== deleted.id) })
    }
  },
}))
