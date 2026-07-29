import { create } from 'zustand'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Exercise,
  MuscleGroup,
  Workout,
  WorkoutSet,
  CreateWorkoutInput,
  CreateWorkoutSetInput,
  UpdateWorkoutSetInput,
  WorkoutProgram,
  CreateProgramInput,
} from '../types/workout'
import {
  getMuscleGroups,
  getExercises,
  getWorkoutByDate,
  getWorkouts,
  createWorkout,
  updateWorkout,
  deleteWorkout,
  addWorkoutSet,
  addWorkoutSets,
  updateWorkoutSet,
  deleteWorkoutSet,
  completeWorkout,
  getWorkoutPrograms,
  createWorkoutProgram,
  deleteWorkoutProgram,
} from '../supabase/workouts'
import { todayDate } from '../utils/date'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any>

interface WorkoutState {
  // Kütüphane
  muscleGroups: MuscleGroup[]
  exercises: Exercise[]
  libraryLoading: boolean

  // Günlük antrenman
  date: string
  todayWorkout: Workout | null
  workoutHistory: Workout[]
  loading: boolean
  error: string | null

  // Programlar
  programs: WorkoutProgram[]

  // Actions
  fetchLibrary: (supabase: Supabase, options?: { force?: boolean }) => Promise<void>
  fetchTodayWorkout: (supabase: Supabase, userId: string, date?: string) => Promise<void>
  fetchHistory: (supabase: Supabase, userId: string) => Promise<void>
  startWorkout: (supabase: Supabase, userId: string, input: CreateWorkoutInput) => Promise<Workout>
  finishWorkout: (supabase: Supabase, workoutId: string, durationMinutes: number, caloriesBurned?: number) => Promise<void>
  skipWorkout: (supabase: Supabase, workoutId: string) => Promise<void>
  removeWorkout: (supabase: Supabase, workoutId: string) => Promise<void>
  addSet: (supabase: Supabase, input: CreateWorkoutSetInput) => Promise<WorkoutSet>
  addSets: (supabase: Supabase, workoutId: string, inputs: CreateWorkoutSetInput[]) => Promise<WorkoutSet[]>
  updateSet: (supabase: Supabase, setId: string, updates: UpdateWorkoutSetInput) => Promise<void>
  removeSet: (supabase: Supabase, setId: string) => Promise<void>
  setWorkoutAiPlan: (supabase: Supabase, workoutId: string, plan: Workout['ai_plan']) => Promise<void>
  fetchPrograms: (supabase: Supabase, userId: string) => Promise<void>
  addProgram: (supabase: Supabase, userId: string, input: CreateProgramInput) => Promise<WorkoutProgram>
  deleteProgram: (supabase: Supabase, programId: string) => Promise<void>

  // Realtime
  handleRealtimeEvent: (event: { eventType: string; new: unknown; old: unknown }) => void
}

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  muscleGroups: [],
  exercises: [],
  libraryLoading: false,
  date: todayDate(),
  todayWorkout: null,
  workoutHistory: [],
  loading: false,
  error: null,
  programs: [],

  fetchLibrary: async (supabase, options) => {
    if (!options?.force && get().exercises.length > 0) return  // cache
    set({ libraryLoading: true })
    try {
      const [muscleGroups, exercises] = await Promise.all([
        getMuscleGroups(supabase),
        getExercises(supabase),
      ])
      set({ muscleGroups, exercises, libraryLoading: false })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Hata', libraryLoading: false })
    }
  },

  fetchTodayWorkout: async (supabase, userId, date = todayDate()) => {
    set({ loading: true, error: null, date })
    try {
      const todayWorkout = await getWorkoutByDate(supabase, userId, date)
      set({ todayWorkout, loading: false })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Hata', loading: false })
    }
  },

  fetchHistory: async (supabase, userId) => {
    const { data } = await supabase
      .from('workouts')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(14)
    set({ workoutHistory: (data ?? []) as Workout[] })
  },

  startWorkout: async (supabase, userId, input) => {
    const workout = await createWorkout(supabase, userId, input)
    set({ todayWorkout: workout })
    return workout
  },

  finishWorkout: async (supabase, workoutId, durationMinutes, caloriesBurned) => {
    const updated = await completeWorkout(supabase, workoutId, durationMinutes, caloriesBurned)
    set((state) => ({
      todayWorkout: state.todayWorkout?.id === workoutId ? updated : state.todayWorkout,
    }))
  },

  skipWorkout: async (supabase, workoutId) => {
    const updated = await updateWorkout(supabase, workoutId, { status: 'skipped' })
    set((state) => ({
      todayWorkout: state.todayWorkout?.id === workoutId ? updated : state.todayWorkout,
    }))
  },

  removeWorkout: async (supabase, workoutId) => {
    await deleteWorkout(supabase, workoutId)
    set((state) => ({
      todayWorkout: state.todayWorkout?.id === workoutId ? null : state.todayWorkout,
      workoutHistory: state.workoutHistory.filter((w) => w.id !== workoutId),
    }))
  },

  addSet: async (supabase, input) => {
    const newSet = await addWorkoutSet(supabase, input)
    set((state) => {
      // Set sadece ekranda açık olan antrenmana aitse listeye eklenir.
      // Eskiden workout_id kontrolü yoktu: başka bir workout'a yazılan setler de
      // todayWorkout'a birikiyor, sayaç gerçekte olmayan setlerle şişiyordu.
      if (!state.todayWorkout || state.todayWorkout.id !== input.workout_id) return state
      return {
        todayWorkout: {
          ...state.todayWorkout,
          workout_sets: [...(state.todayWorkout.workout_sets ?? []), newSet],
        },
      }
    })
    return newSet
  },

  addSets: async (supabase, workoutId, inputs) => {
    const created = await addWorkoutSets(supabase, inputs)
    set((state) => {
      if (!state.todayWorkout || state.todayWorkout.id !== workoutId) return state
      return {
        todayWorkout: {
          ...state.todayWorkout,
          workout_sets: [...(state.todayWorkout.workout_sets ?? []), ...created],
        },
      }
    })
    return created
  },

  updateSet: async (supabase, setId, updates) => {
    const updated = await updateWorkoutSet(supabase, setId, updates)
    set((state) => {
      if (!state.todayWorkout) return state
      return {
        todayWorkout: {
          ...state.todayWorkout,
          workout_sets: state.todayWorkout.workout_sets?.map((s) =>
            s.id === setId ? updated : s,
          ),
        },
      }
    })
  },

  removeSet: async (supabase, setId) => {
    await deleteWorkoutSet(supabase, setId)
    set((state) => {
      if (!state.todayWorkout) return state
      return {
        todayWorkout: {
          ...state.todayWorkout,
          workout_sets: state.todayWorkout.workout_sets?.filter((s) => s.id !== setId),
        },
      }
    })
  },

  setWorkoutAiPlan: async (supabase, workoutId, plan) => {
    await updateWorkout(supabase, workoutId, { ai_plan: plan })
    set((state) => ({
      todayWorkout: state.todayWorkout?.id === workoutId
        ? { ...state.todayWorkout, ai_plan: plan }
        : state.todayWorkout,
    }))
  },

  fetchPrograms: async (supabase, userId) => {
    const programs = await getWorkoutPrograms(supabase, userId)
    set({ programs })
  },

  addProgram: async (supabase, userId, input) => {
    const program = await createWorkoutProgram(supabase, userId, input)
    set((state) => ({ programs: [...state.programs, program] }))
    return program
  },

  deleteProgram: async (supabase, programId) => {
    await deleteWorkoutProgram(supabase, programId)
    set((state) => ({ programs: state.programs.filter((p) => p.id !== programId) }))
  },

  handleRealtimeEvent: (event) => {
    const { eventType, new: newRecord, old: oldRecord } = event
    const { todayWorkout } = get()

    if (eventType === 'UPDATE' && todayWorkout) {
      const updated = newRecord as Workout
      if (updated.id === todayWorkout.id) {
        set({ todayWorkout: { ...todayWorkout, ...updated } })
      }
    } else if (eventType === 'DELETE') {
      const deleted = oldRecord as { id: string }
      if (todayWorkout?.id === deleted.id) set({ todayWorkout: null })
    }
  },
}))
