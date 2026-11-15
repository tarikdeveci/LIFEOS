import { useMemo, useState } from 'react'
import { minimumEndTime, splitMinimumDay, usePlanningStore, useRoutineStore } from '@lifeos/shared'
import type { Task, TimeBlock } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'

/**
 * Bugün ekranının asgari gün durumu (081). Korunmayan rutinin blok ve görevleri
 * `closed` olarak ayrılır; korunan bloğun bitişi asgari süreye kısaltılarak gösterilir.
 * Veri yazılmaz, sadece daily_plans.minimum_mode çevrilir.
 */
export function useMinimumDay(tasks: Task[], blocks: TimeBlock[]) {
  const ready = usePlanningStore((s) => s.todayPlan !== null)
  const minimum = usePlanningStore((s) => s.todayPlan?.minimum_mode ?? false)
  const toggleMinimumMode = usePlanningStore((s) => s.toggleMinimumMode)
  const routines = useRoutineStore((s) => s.routines)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [showClosed, setShowClosed] = useState(false)

  const { active, closed } = useMemo(() => {
    if (!minimum) return { active: { blocks, tasks }, closed: { blocks: [] as TimeBlock[], tasks: [] as Task[] } }
    const split = splitMinimumDay(blocks, tasks, routines)
    const minutes = new Map(routines.map((r) => [r.id, r.min_minutes]))
    const shortened = split.active.blocks.map((b) => {
      const end = b.routine_id ? minimumEndTime(b.start_time, b.end_time, minutes.get(b.routine_id)) : b.end_time
      return end === b.end_time ? b : { ...b, end_time: end }
    })
    return { active: { blocks: shortened, tasks: split.active.tasks }, closed: split.closed }
  }, [minimum, blocks, tasks, routines])

  const hasProtected = routines.some((r) => r.is_active && r.is_protected)

  async function toggle() {
    setBusy(true)
    setFailed(false)
    try {
      await toggleMinimumMode(supabase)
      setShowClosed(false)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return { ready, minimum, active, closed, hasProtected, toggle, busy, failed, showClosed, setShowClosed }
}
