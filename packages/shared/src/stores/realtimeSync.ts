import type { SupabaseClient } from '@supabase/supabase-js'
import { useGoalStore } from './goalStore'
import { useNutritionStore } from './nutritionStore'
import { usePlanningStore } from './planningStore'
import { useRoutineStore } from './routineStore'
import { useTaskStore } from './taskStore'

type RealtimeEvent = { eventType: string; new: unknown; old: unknown }

/** Satır olayını store'a uygulayan tablolar. */
const ROW_TABLES = {
  tasks: (e: RealtimeEvent) => useTaskStore.getState().handleRealtimeEvent(e),
  time_blocks: (e: RealtimeEvent) => usePlanningStore.getState().handleRealtimeEvent(e),
  meals: (e: RealtimeEvent) => useNutritionStore.getState().handleRealtimeEvent(e),
} as const

/** Olayda listesi yeniden okunan tablolar (ilerleme ve sayaç sunucuda hesaplanıyor). */
const REFETCH_TABLES = ['routines', 'routine_completions', 'goals'] as const

/** Aynı anda gelen olaylar tek okumaya iner (alışkanlık işareti iki satır yazabilir). */
const REFETCH_DELAY_MS = 600

/**
 * Kullanıcının tablolarındaki değişiklikleri store'lara bağlar (web ve mobil ortak).
 * Dönen fonksiyon kanalı kapatır.
 */
export function subscribeUserRealtime(supabase: SupabaseClient, userId: string): () => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const refetch = (key: 'routines' | 'goals') => {
    clearTimeout(timers.get(key))
    timers.set(key, setTimeout(() => {
      timers.delete(key)
      if (key === 'goals') void useGoalStore.getState().fetchGoals(supabase, userId)
      else void useRoutineStore.getState().fetchRoutines(supabase, userId)
    }, REFETCH_DELAY_MS))
  }

  // Konu her abonelikte tekil: kapanan kanal henüz silinmeden aynı konu yeniden açılırsa
  // supabase-js eski kanalı döndürüyor ve subscribe sonrası .on() hata veriyor.
  let channel = supabase.channel(`realtime:${userId}:${Math.random().toString(36).slice(2)}`)
  for (const [table, apply] of Object.entries(ROW_TABLES)) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` },
      (payload) => apply({ eventType: payload.eventType, new: payload.new, old: payload.old }))
  }
  for (const table of REFETCH_TABLES) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` },
      () => refetch(table === 'goals' ? 'goals' : 'routines'))
  }
  channel.subscribe((status, err) => {
    if (status === 'CHANNEL_ERROR' && err) console.warn('Realtime subscription error:', err)
  })

  return () => {
    timers.forEach(clearTimeout)
    timers.clear()
    void supabase.removeChannel(channel)
  }
}
