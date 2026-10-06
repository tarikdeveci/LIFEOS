import { create } from 'zustand'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CreateGoalInput, Goal, UpdateGoalInput } from '../types/goal'
import type { TaskStatus } from '../types/task'
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
import { addMonths, goalPeriodEnd, goalPeriodStart, valueScoreForGoal } from '../utils/goals'
import { useTaskStore } from './taskStore'

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
  /** Hedefe bağlı yeni adım (backlog görevi). */
  addStep: (supabase: Supabase, userId: string, goalId: string, title: string) => Promise<void>
  /** Adımı tamamlar ya da geri açar; ilerleme aynı anda güncellenir. */
  setStepDone: (supabase: Supabase, taskId: string, done: boolean) => Promise<void>
  /** Çıkışta: sonraki hesap öncekinin hedeflerini görmesin. */
  reset: () => void
}

const INITIAL = { goals: [] as Goal[], tasks: [] as GoalTask[], loading: false, error: null }

// Çıkışta artar: önceki hesabın geciken yanıtı yeni hesabın store'una yazılmasın.
let generation = 0

export const useGoalStore = create<GoalState>((set, get) => ({
  ...INITIAL,
  reset: () => { generation++; set(INITIAL) },

  fetchGoals: async (supabase, userId, today = todayDate()) => {
    const gen = generation
    set({ loading: true, error: null })
    try {
      const quarter = goalPeriodStart('quarter', today)
      // Geçen çeyrek de gelir: ay başında önceki ayın değerlendirmesi görünsün.
      const since = addMonths(quarter, -3)
      const [goals, tasks] = await Promise.all([
        getGoals(supabase, userId, since),
        getGoalTasks(supabase, userId, since, goalPeriodEnd('quarter', quarter)),
      ])
      if (gen === generation) set({ goals, tasks, loading: false })
    } catch (err) {
      if (gen === generation) set({ error: err instanceof Error ? err.message : 'Hata', loading: false })
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
    // Yeni hedef yazılıp eski hedefin kapanışı başarısız olduysa, tekrar denemede aynı dönem
    // ve başlıkla ikinci hedef açılmasın: önceki denemenin hedefi zaten listede.
    const periodStart = goalPeriodStart(goal.horizon, today)
    const alreadyCarried = get().goals.some((g) =>
      g.id !== goal.id && g.horizon === goal.horizon && g.period_start === periodStart && g.title === goal.title)
    if (decision === 'carry' && !alreadyCarried) {
      await get().addGoal(supabase, userId, {
        horizon: goal.horizon,
        title: goal.title,
        icon: goal.icon,
        period_start: periodStart,
        parent_id: null,
        target: goal.target,
        unit: goal.unit,
        count_mode: goal.count_mode,
        tag_filter: goal.tag_filter,
      })
    }
    await get().editGoal(supabase, goal.id, reviewed)
  },

  // Yazımlar görev store'u üzerinden: açık görev listeleri de aynı anda güncellenir.
  addStep: async (supabase, userId, goalId, title) => {
    const gen = generation
    const taskStore = useTaskStore.getState()
    // CreateTaskInput'ta goal_id yok: adım önce yazılır, sonra bağ ve değer puanı birlikte güncellenir.
    const [task] = await taskStore.addTasks(supabase, userId, [{ title }])
    if (!task) throw new Error('task insert returned no row')
    try {
      await taskStore.updateTask(supabase, task.id, {
        goal_id: goalId,
        value_score: valueScoreForGoal(task.value_score, goalId),
      })
    } catch (err) {
      // Bağlanamayan adım backlog'da sahipsiz kalmasın, tekrar deneme ikinci görev açmasın.
      try { await taskStore.deleteTask(supabase, task.id) } catch { /* asıl hata fırlatılır */ }
      throw err
    }
    if (gen !== generation) return
    const step: GoalTask = {
      id: task.id,
      title: task.title,
      goal_id: goalId,
      status: task.status,
      tags: task.tags,
      estimated_minutes: task.estimated_minutes,
      scheduled_date: task.scheduled_date,
      completed_at: task.completed_at,
    }
    set((state) => ({ tasks: [...state.tasks, step] }))
  },

  setStepDone: async (supabase, taskId, done) => {
    const previous = get().tasks.find((t) => t.id === taskId)
    if (!previous) return
    // Geri açılan adım takvimliyse planned, değilse backlog (reportStore ile aynı kural).
    const status: TaskStatus = done ? 'done' : previous.scheduled_date ? 'planned' : 'backlog'
    const put = (next: GoalTask) => set((state) => ({ tasks: state.tasks.map((t) => (t.id === taskId ? next : t)) }))
    put({ ...previous, status, completed_at: done ? new Date().toISOString() : null })
    try {
      await useTaskStore.getState().setStatus(supabase, taskId, status)
    } catch (err) {
      put(previous)
      throw err
    }
  },
}))
