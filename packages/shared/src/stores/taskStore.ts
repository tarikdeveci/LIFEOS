import { create } from 'zustand'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'
import type { Task, TaskFilters, CreateTaskInput, UpdateTaskInput, TaskStatus } from '../types/task'
import {
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  updateTaskStatus,
  getBacklogTasks,
  reorderTasks,
} from '../supabase/tasks'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any>

interface TaskState {
  tasks: Task[]
  selectedTask: Task | null
  loading: boolean
  error: string | null

  // Actions
  fetchTasks: (supabase: Supabase, userId: string, filters?: TaskFilters) => Promise<void>
  fetchBacklog: (supabase: Supabase, userId: string) => Promise<void>
  selectTask: (supabase: Supabase, taskId: string) => Promise<void>
  clearSelectedTask: () => void
  addTask: (supabase: Supabase, userId: string, input: CreateTaskInput) => Promise<Task>
  updateTask: (supabase: Supabase, taskId: string, updates: UpdateTaskInput) => Promise<void>
  deleteTask: (supabase: Supabase, taskId: string) => Promise<void>
  setStatus: (supabase: Supabase, taskId: string, status: TaskStatus) => Promise<void>
  reorderTasks: (supabase: Supabase, taskIds: string[]) => Promise<void>

  // Realtime handler
  handleRealtimeEvent: (event: { eventType: string; new: unknown; old: unknown }) => void
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  selectedTask: null,
  loading: false,
  error: null,

  fetchTasks: async (supabase, userId, filters) => {
    set({ loading: true, error: null })
    try {
      const tasks = await getTasks(supabase, userId, filters)
      set({ tasks, loading: false })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Hata', loading: false })
    }
  },

  fetchBacklog: async (supabase, userId) => {
    set({ loading: true, error: null })
    try {
      const tasks = await getBacklogTasks(supabase, userId)
      set({ tasks, loading: false })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Hata', loading: false })
    }
  },

  selectTask: async (supabase, taskId) => {
    try {
      const task = await getTaskById(supabase, taskId)
      set({ selectedTask: task })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Hata' })
    }
  },

  clearSelectedTask: () => set({ selectedTask: null }),

  addTask: async (supabase, userId, input) => {
    const task = await createTask(supabase, userId, input)
    // Optimistic: listeye ekle
    set((state) => ({ tasks: [task, ...state.tasks] }))
    return task
  },

  updateTask: async (supabase, taskId, updates) => {
    // Optimistic update
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)),
      selectedTask:
        state.selectedTask?.id === taskId
          ? { ...state.selectedTask, ...updates }
          : state.selectedTask,
    }))
    await updateTask(supabase, taskId, updates)
  },

  deleteTask: async (supabase, taskId) => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
      selectedTask: state.selectedTask?.id === taskId ? null : state.selectedTask,
    }))
    await deleteTask(supabase, taskId)
  },

  setStatus: async (supabase, taskId, status) => {
    // Optimistic update
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId
          ? { ...t, status, completed_at: status === 'done' ? new Date().toISOString() : null }
          : t,
      ),
    }))
    await updateTaskStatus(supabase, taskId, status)
  },

  reorderTasks: async (supabase, taskIds) => {
    // Optimistic: sort_order güncelle
    set((state) => {
      const orderMap = new Map(taskIds.map((id, i) => [id, i]))
      return {
        tasks: [...state.tasks].sort(
          (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0),
        ),
      }
    })
    await reorderTasks(supabase, taskIds)
  },

  handleRealtimeEvent: (event) => {
    const { eventType, new: newRecord, old: oldRecord } = event
    const { tasks } = get()

    if (eventType === 'INSERT') {
      const task = newRecord as Task
      if (!tasks.find((t) => t.id === task.id)) {
        set({ tasks: [task, ...tasks] })
      }
    } else if (eventType === 'UPDATE') {
      const task = newRecord as Task
      set({ tasks: tasks.map((t) => (t.id === task.id ? { ...t, ...task } : t)) })
    } else if (eventType === 'DELETE') {
      const deleted = oldRecord as { id: string }
      set({ tasks: tasks.filter((t) => t.id !== deleted.id) })
    }
  },
}))
