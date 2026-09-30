import { create } from 'zustand'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CreateGoalInput, Goal, UpdateGoalInput } from '../types/goal'
import {
  createGoal,
  createGoals,
  deleteGoal,
  getGoalTasks,
  getGoals,
  updateGoal,
  type GoalTask,
} from '../supabase/goals'
import { todayDate } from '../utils/date'
import { addMonths, goalPeriodEnd, goalPeriodStart } from '../utils/goals'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any>

export type GoalReviewDecision = 'done' | 'dropped' | 'carry'

interface GoalState {
  goals: Goal[]
  /** İlerleme hesabına giren görevler (bağlı olanlar + bu çeyrekte tamamlananlar). */
  tasks: GoalTask[]
  loading: boolean
  error: string | null

  fetchGoals: (supabase: Supabase, userId: string, today?: string) => Promise<void>
  addGoal: (supabase: Supabase, userId: string, input: CreateGoalInput) => Promise<Goal>
  /** localStorage'dan taşınan eski haftalık hedefler. */
  importGoals: (supabase: Supabase, userId: string, inputs: CreateGoalInput[]) => Promise<void>
  editGoal: (supabase: Supabase, goalId: string, input: UpdateGoalInput) => Promise<void>
  removeGoal: (supabase: Supabase, goalId: string) => Promise<void>
  /** Geçmiş ayın hedefini kapatır; "carry" bu aya aynı başlıkla yeni hedef açar. */
  reviewGoal: (
    supabase: Supabase,
    userId: string,
    goal: Goal,
    decision: GoalReviewDecision,
    note: string,
    today?: string,
  ) => Promise<void>
  /** Çıkışta: sonraki hesap öncekinin hedeflerini görmesin. */
  reset: () => void
}

const INITIAL = { goals: [] as Goal[], tasks: [] as GoalTask[], loading: false, error: null }

export const useGoalStore = create<GoalState>((set, get) => ({
  ...INITIAL,
  reset: () => set(INITIAL),

  fetchGoals: async (supabase, userId, today = todayDate()) => {
    set({ loading: true, error: null })
    try {
      const quarter = goalPeriodStart('quarter', today)
      // Geçen çeyrek de gelir: ay başında önceki ayın değerlendirmesi görünsün.
      const since = addMonths(quarter, -3)
      const [goals, tasks] = await Promise.all([
        getGoals(supabase, userId, since),
        getGoalTasks(supabase, userId, since, goalPeriodEnd('quarter', quarter)),
      ])
      set({ goals, tasks, loading: false })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Hata', loading: false })
    }
  },

  // Satır id'si insert dönünce belli; iyimser ekleme yok.
  addGoal: async (supabase, userId, input) => {
    const goal = await createGoal(supabase, userId, input)
    set((state) => ({ goals: [...state.goals, goal] }))
    return goal
  },

  importGoals: async (supabase, userId, inputs) => {
    const created = await createGoals(supabase, userId, inputs)
    set((state) => ({ goals: [...state.goals, ...created] }))
  },

  editGoal: async (supabase, goalId, input) => {
    const previous = get().goals.find((g) => g.id === goalId)
    set((state) => ({
      goals: state.goals.map((g) => (g.id === goalId ? { ...g, ...input } as Goal : g)),
    }))
    try {
      const updated = await updateGoal(supabase, goalId, input)
      set((state) => ({ goals: state.goals.map((g) => (g.id === goalId ? updated : g)) }))
    } catch (err) {
      if (previous) {
        set((state) => ({ goals: state.goals.map((g) => (g.id === goalId ? previous : g)) }))
      }
      throw err
    }
  },

  removeGoal: async (supabase, goalId) => {
    const previous = get()
    set({
      goals: previous.goals
        .filter((g) => g.id !== goalId)
        .map((g) => (g.parent_id === goalId ? { ...g, parent_id: null } : g)),
      tasks: previous.tasks.map((t) => (t.goal_id === goalId ? { ...t, goal_id: null } : t)),
    })
    try {
      await deleteGoal(supabase, goalId)
    } catch (err) {
      set({ goals: previous.goals, tasks: previous.tasks })
      throw err
    }
  },

  reviewGoal: async (supabase, userId, goal, decision, note, today = todayDate()) => {
    const reviewed = {
      status: decision === 'dropped' ? 'dropped' as const : decision === 'done' ? 'done' as const : 'active' as const,
      review_note: note.trim() || null,
      reviewed_at: new Date().toISOString(),
    }
    // Önce yeni hedef: oluşturma başarısız olursa eski hedef değerlendirme listesinde
    // kalır ve tekrar denenebilir. Ters sırada eski hedef sessizce kaybolurdu.
    if (decision === 'carry') {
      await get().addGoal(supabase, userId, {
        horizon: goal.horizon,
        title: goal.title,
        icon: goal.icon,
        period_start: goalPeriodStart(goal.horizon, today),
        parent_id: null,
        target: goal.target,
        unit: goal.unit,
        count_mode: goal.count_mode,
        tag_filter: goal.tag_filter,
      })
    }
    await get().editGoal(supabase, goal.id, reviewed)
  },
}))
