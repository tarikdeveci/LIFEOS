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
  setHabitCount as writeHabitCount,
  RoutineRegenerateError,
} from '../supabase/routines'
import { todayDate, shiftIsoDate } from '../utils/date'
import { mondayOf } from '../utils/routine'

/** Alışkanlık sayacı yazma kuyruğu ve sürümü, rutin/gün anahtarıyla. */
const habitQueues = new Map<string, Promise<void>>()
const habitVersions = new Map<string, number>()

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
  /** O günkü sayacı yazar (0 = işaret yok). İyimser: önce ekran, hata olursa geri alınır. */
  setHabitCount: (
    supabase: Supabase,
    userId: string,
    routineId: string,
    day: string,
    count: number,
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
      if (err instanceof RoutineRegenerateError) {
        set((state) => ({ routines: state.routines.map((r) => (r.id === routineId ? err.routine : r)).sort(byStartTime) }))
      } else if (previous) {
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

  setHabitCount: async (supabase, userId, routineId, day, count) => {
    const key = `${routineId}|${day}`
    const version = (habitVersions.get(key) ?? 0) + 1
    habitVersions.set(key, version)
    const isKey = (c: RoutineCompletion) => c.routine_id === routineId && c.completed_on === day
    const before = get().completions.find(isKey)
    const replace = (entry: RoutineCompletion | undefined) =>
      set((state) => ({ completions: [...state.completions.filter((c) => !isKey(c)), ...(entry ? [entry] : [])] }))
    replace(count > 0 ? { routine_id: routineId, user_id: userId, completed_on: day, count, created_at: new Date().toISOString() } : undefined)

    // Aynı sayaca yazmalar sırayla gider: art arda 1 ve 2 gönderilince sunucunun önce 2'yi
    // sonra 1'i işlemesi ekranda 2, veritabanında 1 bırakıyordu.
    const write = (habitQueues.get(key) ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => writeHabitCount(supabase, userId, routineId, day, count))
    habitQueues.set(key, write)
    try {
      await write
    } catch (err) {
      // Yalnız bu rutin/gün geri alınır (eskiden bütün liste dönüyor, başka alışkanlığın
      // başarılı işareti de siliniyordu); bu arada daha yeni bir değer girildiyse o kalır.
      if (habitVersions.get(key) === version) replace(before)
      throw err
    } finally {
      if (habitQueues.get(key) === write) habitQueues.delete(key)
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
