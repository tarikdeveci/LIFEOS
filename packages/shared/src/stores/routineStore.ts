import { create } from 'zustand'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CreateRoutineInput,
  Routine,
  RoutineCompletion,
  UpdateRoutineInput,
} from '../types/routine'
import {
  getRoutines,
  createRoutine,
  updateRoutineSeries,
  deleteRoutine,
  getRoutineCompletions,
  setRoutineCompletion,
} from '../supabase/routines'
import { todayDate, shiftIsoDate } from '../utils/date'
import { mondayOf } from '../utils/routine'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any>

interface RoutineState {
  routines: Routine[]
  /** İçinde bulunulan haftanın alışkanlık tamamlamaları. */
  completions: RoutineCompletion[]
  loading: boolean
  error: string | null

  // Actions
  fetchRoutines: (supabase: Supabase, userId: string, today?: string) => Promise<void>
  addRoutine: (supabase: Supabase, userId: string, input: CreateRoutineInput) => Promise<Routine>
  updateSeries: (
    supabase: Supabase,
    routineId: string,
    input: UpdateRoutineInput,
    fromDate?: string,
  ) => Promise<void>
  removeRoutine: (supabase: Supabase, routineId: string) => Promise<void>
  toggleHabit: (
    supabase: Supabase,
    userId: string,
    routineId: string,
    day: string,
    completed: boolean,
  ) => Promise<void>

  // Realtime handler (routines tablosu)
  handleRealtimeEvent: (event: { eventType: string; new: unknown; old: unknown }) => void
}

const byStartTime = (a: Routine, b: Routine) =>
  (a.start_time ?? '99').localeCompare(b.start_time ?? '99') || a.created_at.localeCompare(b.created_at)

export const useRoutineStore = create<RoutineState>((set, get) => ({
  routines: [],
  completions: [],
  loading: false,
  error: null,

  fetchRoutines: async (supabase, userId, today = todayDate()) => {
    set({ loading: true, error: null })
    try {
      const from = mondayOf(today)
      const [routines, completions] = await Promise.all([
        getRoutines(supabase, userId),
        getRoutineCompletions(supabase, userId, from, shiftIsoDate(from, 6)),
      ])
      set({ routines, completions, loading: false })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Hata', loading: false })
    }
  },

  // Örnekleri sunucu ürettiği için burada optimistic ekleme yok: satır id'si ve
  // üretilen bloklar ancak insert dönünce belli.
  addRoutine: async (supabase, userId, input) => {
    const routine = await createRoutine(supabase, userId, input)
    set((state) => ({
      routines: state.routines.some((r) => r.id === routine.id)
        ? state.routines
        : [...state.routines, routine].sort(byStartTime),
    }))
    return routine
  },

  updateSeries: async (supabase, routineId, input, fromDate) => {
    const previous = get().routines.find((r) => r.id === routineId)
    set((state) => ({
      routines: state.routines.map((r) => (r.id === routineId ? { ...r, ...input } as Routine : r)),
    }))
    try {
      const updated = await updateRoutineSeries(supabase, routineId, input, fromDate)
      set((state) => ({
        routines: state.routines.map((r) => (r.id === routineId ? updated : r)).sort(byStartTime),
      }))
    } catch (err) {
      if (previous) {
        set((state) => ({ routines: state.routines.map((r) => (r.id === routineId ? previous : r)) }))
      }
      throw err
    }
  },

  removeRoutine: async (supabase, routineId) => {
    const previous = get().routines
    set({ routines: previous.filter((r) => r.id !== routineId) })
    try {
      await deleteRoutine(supabase, routineId)
    } catch (err) {
      set({ routines: previous })
      throw err
    }
  },

  toggleHabit: async (supabase, userId, routineId, day, completed) => {
    const previous = get().completions
    const without = previous.filter((c) => !(c.routine_id === routineId && c.completed_on === day))
    set({
      completions: completed
        ? [...without, { routine_id: routineId, user_id: userId, completed_on: day, created_at: new Date().toISOString() }]
        : without,
    })
    try {
      await setRoutineCompletion(supabase, userId, routineId, day, completed)
    } catch (err) {
      set({ completions: previous })
      throw err
    }
  },

  handleRealtimeEvent: (event) => {
    const { eventType, new: newRecord, old: oldRecord } = event
    const { routines } = get()

    if (eventType === 'INSERT') {
      const routine = newRecord as Routine
      if (!routines.find((r) => r.id === routine.id)) {
        set({ routines: [...routines, routine].sort(byStartTime) })
      }
    } else if (eventType === 'UPDATE') {
      const routine = newRecord as Routine
      set({ routines: routines.map((r) => (r.id === routine.id ? { ...r, ...routine } : r)).sort(byStartTime) })
    } else if (eventType === 'DELETE') {
      const deleted = oldRecord as { id: string }
      set({ routines: routines.filter((r) => r.id !== deleted.id) })
    }
  },
}))
