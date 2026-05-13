'use client'

import { useEffect } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useTaskStore, usePlanningStore, useNutritionStore } from '@lifeos/shared'

/**
 * Supabase Realtime subscription hook.
 * tasks, time_blocks, meals tablolarındaki değişiklikleri dinler.
 * Authenticated user'ın kendi verileri için çalışır (RLS).
 */
export function useRealtimeSync(supabase: SupabaseClient, userId: string | null) {
  const handleTaskEvent = useTaskStore((s) => s.handleRealtimeEvent)
  const handlePlanningEvent = usePlanningStore((s) => s.handleRealtimeEvent)
  const handleNutritionEvent = useNutritionStore((s) => s.handleRealtimeEvent)

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`realtime:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          handleTaskEvent({
            eventType: payload.eventType,
            new: payload.new,
            old: payload.old,
          })
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'time_blocks',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          handlePlanningEvent({
            eventType: payload.eventType,
            new: payload.new,
            old: payload.old,
          })
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meals',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          handleNutritionEvent({
            eventType: payload.eventType,
            new: payload.new,
            old: payload.old,
          })
        },
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' && err) {
          console.warn('Realtime subscription error:', err)
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, userId, handleTaskEvent, handlePlanningEvent, handleNutritionEvent])
}
