import { create } from 'zustand'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'
import type { TimeBlock, DailyPlan, CreateTimeBlockInput, UpdateTimeBlockInput } from '../types/planning'
import type { Task } from '../types/task'
import {
  getTimeBlocks,
  createTimeBlock,
  updateTimeBlock,
  deleteTimeBlock,
  getDailyPlan,
  updateDailyPlan,
  getFlexTasks,
  getCarryoverTasks,
} from '../supabase/planning'
import { todayDate } from '../utils/date'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any>

interface PlanningState {
  date: string
  timeBlocks: TimeBlock[]
  dailyPlan: DailyPlan | null
  flexTasks: Task[]
  carryoverTasks: Task[]
  loading: boolean
  error: string | null

  // Actions
  fetchDayData: (supabase: Supabase, userId: string, date?: string) => Promise<void>
  addTimeBlock: (supabase: Supabase, userId: string, input: CreateTimeBlockInput) => Promise<void>
  updateTimeBlock: (supabase: Supabase, blockId: string, updates: UpdateTimeBlockInput) => Promise<void>
  removeTimeBlock: (supabase: Supabase, blockId: string) => Promise<void>
  setEnergyLevel: (supabase: Supabase, level: 1 | 2 | 3 | 4 | 5) => Promise<void>

  // Realtime handler
  handleRealtimeEvent: (event: { eventType: string; new: unknown; old: unknown }) => void
}

export const usePlanningStore = create<PlanningState>((set, get) => ({
  date: todayDate(),
  timeBlocks: [],
  dailyPlan: null,
  flexTasks: [],
  carryoverTasks: [],
  loading: false,
  error: null,

  fetchDayData: async (supabase, userId, date = todayDate()) => {
    set({ loading: true, error: null, date })
    try {
      const [timeBlocks, dailyPlan, flexTasks, carryoverTasks] = await Promise.all([
        getTimeBlocks(supabase, userId, date),
        getDailyPlan(supabase, userId, date),
        getFlexTasks(supabase, userId, date),
        getCarryoverTasks(supabase, userId),
      ])
      set({ timeBlocks, dailyPlan, flexTasks, carryoverTasks, loading: false })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Hata', loading: false })
    }
  },

  addTimeBlock: async (supabase, userId, input) => {
    const block = await createTimeBlock(supabase, userId, input)
    set((state) => ({
      timeBlocks: [...state.timeBlocks, block].sort((a, b) =>
        a.start_time.localeCompare(b.start_time),
      ),
    }))
  },

  updateTimeBlock: async (supabase, blockId, updates) => {
    set((state) => ({
      timeBlocks: state.timeBlocks.map((b) =>
        b.id === blockId ? { ...b, ...updates } : b,
      ),
    }))
    await updateTimeBlock(supabase, blockId, updates)
  },

  removeTimeBlock: async (supabase, blockId) => {
    set((state) => ({
      timeBlocks: state.timeBlocks.filter((b) => b.id !== blockId),
    }))
    await deleteTimeBlock(supabase, blockId)
  },

  setEnergyLevel: async (supabase, level) => {
    const { dailyPlan } = get()
    if (!dailyPlan) return

    set((state) => ({
      dailyPlan: state.dailyPlan ? { ...state.dailyPlan, energy_level: level } : null,
    }))
    await updateDailyPlan(supabase, dailyPlan.id, { energy_level: level })
  },

  handleRealtimeEvent: (event) => {
    const { eventType, new: newRecord, old: oldRecord } = event
    const { timeBlocks } = get()

    if (eventType === 'INSERT') {
      const block = newRecord as TimeBlock
      if (!timeBlocks.find((b) => b.id === block.id)) {
        set({
          timeBlocks: [...timeBlocks, block].sort((a, b) =>
            a.start_time.localeCompare(b.start_time),
          ),
        })
      }
    } else if (eventType === 'UPDATE') {
      const block = newRecord as TimeBlock
      set({ timeBlocks: timeBlocks.map((b) => (b.id === block.id ? { ...b, ...block } : b)) })
    } else if (eventType === 'DELETE') {
      const deleted = oldRecord as { id: string }
      set({ timeBlocks: timeBlocks.filter((b) => b.id !== deleted.id) })
    }
  },
}))
