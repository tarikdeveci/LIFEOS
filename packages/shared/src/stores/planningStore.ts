import { create } from 'zustand'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'
import type { TimeBlock, DailyPlan, CreateTimeBlockInput, UpdateTimeBlockInput } from '../types/planning'
import type { Task } from '../types/task'
import {
  getTimeBlocks,
  createTimeBlock,
  createTimeBlocks,
  updateTimeBlock,
  deleteTimeBlock,
  getDailyPlan,
  updateDailyPlan,
  getFlexTasks,
  getCarryoverTasks,
  getCalendarBusy,
} from '../supabase/planning'
import { todayDate } from '../utils/date'
import type { Interval, Placement, ShiftResult } from '../utils/dayPlan'
import { busyToIntervals } from '../utils/dayPlan'
import { useTaskStore } from './taskStore'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any>

interface PlanningState {
  date: string
  timeBlocks: TimeBlock[]
  dailyPlan: DailyPlan | null
  flexTasks: Task[]
  carryoverTasks: Task[]
  /** Google takvimindeki dolu aralıklar (gün içi dakika); bağlantı yoksa boş. */
  busy: Interval[]
  loading: boolean
  error: string | null

  // Actions
  fetchDayData: (supabase: Supabase, userId: string, date?: string) => Promise<void>
  addTimeBlock: (supabase: Supabase, userId: string, input: CreateTimeBlockInput) => Promise<void>
  updateTimeBlock: (supabase: Supabase, blockId: string, updates: UpdateTimeBlockInput) => Promise<void>
  removeTimeBlock: (supabase: Supabase, blockId: string) => Promise<void>
  setBlockDone: (supabase: Supabase, blockId: string, done: boolean) => Promise<void>
  setEnergyLevel: (supabase: Supabase, level: 1 | 2 | 3 | 4 | 5) => Promise<void>
  completeRitual: (supabase: Supabase) => Promise<void>
  /** autoPlace sonucunu o güne görev blokları olarak yazar, sonra günü yeniden okur. */
  placeTasks: (supabase: Supabase, userId: string, placements: Placement[], titles: Record<string, string>) => Promise<number>
  /** shiftRemaining sonucunu uygular; yazma hatasında tüm bloklar geri sarılır. */
  applyShift: (supabase: Supabase, updates: ShiftResult['updates']) => Promise<void>

  // Realtime handler
  handleRealtimeEvent: (event: { eventType: string; new: unknown; old: unknown }) => void
}

export const usePlanningStore = create<PlanningState>((set, get) => ({
  date: todayDate(),
  timeBlocks: [],
  dailyPlan: null,
  flexTasks: [],
  carryoverTasks: [],
  busy: [],
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
      // Meşgul penceresi yardımcı bilgi: okunamazsa (tablo yok, bağlantı yok) plan yine açılır.
      try {
        set({ busy: busyToIntervals(await getCalendarBusy(supabase, userId, date), date) })
      } catch {
        set({ busy: [] })
      }
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

  /**
   * Bloğu tek dokunuşla tamamlandı/geri al.
   *
   * Bloğa bağlı bir görev varsa o da aynı anda kapanıyor: kullanıcı için bunlar
   * tek bir iş, iki ayrı yerde işaretlemek zorunda kalmamalı. Geri alırken görev
   * 'planned'a döner — takvimde yeri olan bir iş 'backlog'a düşerse plandan
   * kaybolur.
   *
   * Yazma başarısız olursa hem blok hem görev eski hâline geri sarılır; aksi
   * halde ekranda tamamlanmış görünen ama sunucuda duran bir blok kalıyor.
   */
  setBlockDone: async (supabase, blockId, done) => {
    const previous = get().timeBlocks.find((b) => b.id === blockId)
    if (!previous) return

    const completedAt = done ? new Date().toISOString() : null
    set((state) => ({
      timeBlocks: state.timeBlocks.map((b) =>
        b.id === blockId ? { ...b, completed_at: completedAt } : b,
      ),
    }))

    try {
      await updateTimeBlock(supabase, blockId, { completed_at: completedAt })
      if (previous.task_id) {
        await useTaskStore.getState().setStatus(supabase, previous.task_id, done ? 'done' : 'planned')
      }
    } catch (err) {
      set((state) => ({
        timeBlocks: state.timeBlocks.map((b) => (b.id === blockId ? previous : b)),
      }))
      throw err
    }
  },

  setEnergyLevel: async (supabase, level) => {
    const { dailyPlan } = get()
    if (!dailyPlan) return

    set((state) => ({
      dailyPlan: state.dailyPlan ? { ...state.dailyPlan, energy_level: level } : null,
    }))
    await updateDailyPlan(supabase, dailyPlan.id, { energy_level: level })
  },

  completeRitual: async (supabase) => {
    const { dailyPlan } = get()
    if (!dailyPlan) return
    const at = new Date().toISOString()
    set({ dailyPlan: { ...dailyPlan, ritual_completed_at: at } })
    try {
      await updateDailyPlan(supabase, dailyPlan.id, { ritual_completed_at: at })
    } catch (err) {
      set({ dailyPlan })
      throw err
    }
  },

  placeTasks: async (supabase, userId, placements, titles) => {
    const { date } = get()
    const { inserted } = await createTimeBlocks(supabase, userId, placements.map((p) => ({
      date,
      start_time: p.start_time,
      end_time: p.end_time,
      block_type: 'task' as const,
      label: titles[p.task_id],
      task_id: p.task_id,
    })))
    await get().fetchDayData(supabase, userId, date)
    return inserted
  },

  applyShift: async (supabase, updates) => {
    if (updates.length === 0) return
    const previous = get().timeBlocks
    const byId = new Map(updates.map((u) => [u.id, u]))
    set({
      timeBlocks: previous
        .map((b) => {
          const u = byId.get(b.id)
          return u ? { ...b, start_time: u.start_time, end_time: u.end_time } : b
        })
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    })
    try {
      await Promise.all(updates.map((u) => updateTimeBlock(supabase, u.id, { start_time: u.start_time, end_time: u.end_time })))
    } catch (err) {
      set({ timeBlocks: previous })
      throw err
    }
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
