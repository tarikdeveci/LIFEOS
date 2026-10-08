import { create } from 'zustand'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CreateGoalInput, Goal, GoalEntry, UpdateGoalInput } from '../types/goal'
import type { TaskStatus } from '../types/task'
import {
  createGoal,
  createGoalEntry,
  deleteGoalEntry,
  getGoalEntries,
  createGoals,
  deleteGoal,
  getGoalTasks,
  getGoals,
  updateGoal,
  type GoalTask,
} from '../supabase/goals'
import { todayDate } from '../utils/date'
import { addMonths, goalPeriodEnd, goalPeriodStart, goalsToAutoComplete, goalTreeProgress, valueScoreForGoal } from '../utils/goals'
import { useTaskStore } from './taskStore'

type Supabase = SupabaseClient

export type GoalReviewDecision = 'done' | 'dropped' | 'carry'

interface GoalState {
  goals: Goal[]
  entries: GoalEntry[]
  /** İlerleme hesabına giren görevler (bağlı olanlar + bu çeyrekte tamamlananlar). */
  tasks: GoalTask[]
  loading: boolean
  error: string | null

  fetchGoals: (supabase: Supabase, userId: string, today?: string) => Promise<void>
  logProgress: (supabase: Supabase, userId: string, goalId: string, amount: number, entryDate?: string) => Promise<void>
  removeEntry: (supabase: Supabase, entryId: string) => Promise<void>
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

const INITIAL = { goals: [] as Goal[], tasks: [] as GoalTask[], entries: [] as GoalEntry[], loading: false, error: null }

// Çıkışta artar: önceki hesabın geciken yanıtı yeni hesabın store'una yazılmasın.
let generation = 0
let activeClient: Supabase | null = null
let activeUser: string | null = null
let statusQueue: Promise<void> = Promise.resolve()
let entrySequence = 0
let stepWrites = 0

// Görevin sayıldığı hedefler: doğrudan bağlı olan ya da etiketi eşleşen.
function goalIdsForTask(goals: Goal[], task: Pick<GoalTask, 'goal_id' | 'tags'>): string[] {
  return goals.filter((g) => g.id === task.goal_id || g.tag_filter.some((tag) => task.tags?.includes(tag))).map((g) => g.id)
}

// Durum yazmaları sırayla gider; her tur güncel ilerlemeyi okur. Yalnızca reopen
// içindeki hedefler geri açılır: kullanıcının elle kapattığı başka hedef açılmasın.
async function reconcileGoals(supabase: Supabase, reopen: ReadonlySet<string> = new Set()): Promise<void> {
  const gen = generation
  const previous = statusQueue
  const job = async () => {
    await previous
    if (gen !== generation) return
    const state = useGoalStore.getState()
    const progress = goalTreeProgress(state.goals, state.tasks, state.entries.filter((e) => !e.id.startsWith('pending-')))
    const reopenIds = state.goals.filter((g) => reopen.has(g.id) && g.status === 'done'
      && g.target != null && (progress.get(g.id)?.pct ?? 0) < 100).map((g) => g.id)
    for (const id of reopenIds) {
      if (gen !== generation) return
      await useGoalStore.getState().editGoal(supabase, id, { status: 'active' })
    }
    const fresh = useGoalStore.getState()
    const ids = goalsToAutoComplete(fresh.goals, goalTreeProgress(fresh.goals, fresh.tasks, fresh.entries.filter((e) => !e.id.startsWith('pending-'))))
    for (const id of ids) {
      if (gen !== generation) return
      await useGoalStore.getState().editGoal(supabase, id, { status: 'done' })
    }
  }
  statusQueue = (async () => {
    try { await job() } catch {
      // Kayıt başarılı olabilir; yeniden miktar ekletmeden hatayı göster.
      if (gen === generation) useGoalStore.setState({ error: 'Hedef durumu kaydedilemedi' })
    }
  })()
  await statusQueue
}

export const useGoalStore = create<GoalState>((set, get) => ({
  ...INITIAL,
  reset: () => { generation++; activeClient = null; activeUser = null; statusQueue = Promise.resolve(); set(INITIAL) },

  fetchGoals: async (supabase, userId, today = todayDate()) => {
    if (activeUser && activeUser !== userId) get().reset()
    activeClient = supabase
    activeUser = userId
    const gen = generation
    set({ loading: true, error: null })
    try {
      const quarter = goalPeriodStart('quarter', today)
      // Geçen çeyrek de gelir: ay başında önceki ayın değerlendirmesi görünsün.
      const since = addMonths(quarter, -3)
      const [goals, tasks, entries] = await Promise.all([
        getGoals(supabase, userId, since),
        getGoalTasks(supabase, userId, since, goalPeriodEnd('quarter', quarter)),
        getGoalEntries(supabase, userId, since, goalPeriodEnd('quarter', quarter)),
      ])
      if (gen !== generation) return
      set({ goals, tasks, entries, loading: false })
      await reconcileGoals(supabase)
    } catch (err) {
      if (gen === generation) set({ error: err instanceof Error ? err.message : 'Hata', loading: false })
    }
  },

  logProgress: async (supabase, userId, goalId, amount, entryDate = todayDate()) => {
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) throw new Error('Geçersiz miktar')
    const goal = get().goals.find((g) => g.id === goalId && g.user_id === userId)
    if (!goal || goal.target == null || !goal.count_mode) throw new Error('Sayılabilir hedef bulunamadı')
    const gen = generation
    const id = `pending-goal-entry-${++entrySequence}`
    const optimistic: GoalEntry = {
      id, goal_id: goalId, user_id: userId, amount, entry_date: entryDate,
      note: null, created_at: new Date().toISOString(),
    }
    set((state) => ({ entries: [optimistic, ...state.entries], error: null }))
    try {
      const entry = await createGoalEntry(supabase, userId, { goal_id: goalId, amount, entry_date: entryDate })
      if (gen !== generation) return
      set((state) => ({ entries: state.entries.map((e) => e.id === id ? entry : e) }))
    } catch (err) {
      if (gen === generation) set((state) => ({ entries: state.entries.filter((e) => e.id !== id) }))
      throw err
    }
    await reconcileGoals(supabase)
  },

  removeEntry: async (supabase, entryId) => {
    const entry = get().entries.find((e) => e.id === entryId)
    if (!entry || entryId.startsWith('pending-')) return
    const gen = generation
    set((state) => ({ entries: state.entries.filter((e) => e.id !== entryId), error: null }))
    try {
      await deleteGoalEntry(supabase, entryId)
    } catch (err) {
      if (gen === generation) set((state) => ({ entries: [...state.entries, entry] }))
      throw err
    }
    if (gen === generation) await reconcileGoals(supabase, new Set([entry.goal_id]))
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
    const gen = generation
    const previous = get().goals.find((g) => g.id === goalId)
    set((state) => ({
      goals: state.goals.map((g) => (g.id === goalId ? { ...g, ...input } as Goal : g)),
    }))
    try {
      const updated = await updateGoal(supabase, goalId, input)
      if (gen === generation) set((state) => ({ goals: state.goals.map((g) => (g.id === goalId ? { ...g, ...updated } : g)) }))
    } catch (err) {
      if (previous && gen === generation) {
        set((state) => ({ goals: state.goals.map((g) => (g.id === goalId ? previous : g)) }))
      }
      throw err
    }
  },

  removeGoal: async (supabase, goalId) => {
    const previous = get()
    set({
      entries: previous.entries.filter((e) => e.goal_id !== goalId),
      goals: previous.goals
        .filter((g) => g.id !== goalId)
        .map((g) => (g.parent_id === goalId ? { ...g, parent_id: null } : g)),
      tasks: previous.tasks.map((t) => (t.goal_id === goalId ? { ...t, goal_id: null } : t)),
    })
    try {
      await deleteGoal(supabase, goalId)
    } catch (err) {
      set({ goals: previous.goals, tasks: previous.tasks, entries: previous.entries })
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
      if (gen === generation) set((state) => ({ tasks: state.tasks.filter((t) => t.id !== task.id) }))
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
    set((state) => ({ tasks: [...state.tasks.filter((t) => t.id !== step.id), step] }))
  },

  setStepDone: async (supabase, taskId, done) => {
    const previous = get().tasks.find((t) => t.id === taskId)
    if (!previous) return
    // Geri açılan adım takvimliyse planned, değilse backlog (reportStore ile aynı kural).
    const status: TaskStatus = done ? 'done' : previous.scheduled_date ? 'planned' : 'backlog'
    const put = (next: GoalTask) => set((state) => ({ tasks: state.tasks.map((t) => (t.id === taskId ? next : t)) }))
    const gen = generation
    stepWrites++
    put({ ...previous, status, completed_at: done ? new Date().toISOString() : null })
    try {
      await useTaskStore.getState().setStatus(supabase, taskId, status)
    } catch (err) {
      if (gen === generation) put(previous)
      throw err
    } finally {
      stepWrites--
    }
    if (gen === generation) await reconcileGoals(supabase, done ? new Set() : new Set(goalIdsForTask(get().goals, previous)))
  },
}))

// Görev ekranındaki değişiklikler hedef kartına anında yansır.
useTaskStore.subscribe((state, previous) => {
  if (state.tasks === previous.tasks) return
  const goals = useGoalStore.getState().goals
  const tasks = [...useGoalStore.getState().tasks]
  let changed = false
  const reopened = new Set<string>()
  for (const task of state.tasks) {
    if (activeUser && task.user_id !== activeUser) continue
    const old = previous.tasks.find((t) => t.id === task.id)
    if (old === task) continue
    const index = tasks.findIndex((t) => t.id === task.id)
    const relevant = goals.some((g) => g.id === task.goal_id
      || (task.status === 'done' && g.tag_filter.some((tag) => task.tags?.includes(tag))))
    if (index < 0 && !relevant) continue
    if (old?.status === 'done' && task.status !== 'done') goalIdsForTask(goals, task).forEach((id) => reopened.add(id))
    if (index >= 0) tasks[index] = { ...tasks[index]!, ...task }
    else tasks.push(task)
    changed = true
  }
  if (!changed) return
  useGoalStore.setState({ tasks })
  if (activeClient && stepWrites === 0) void reconcileGoals(activeClient, reopened)
})
