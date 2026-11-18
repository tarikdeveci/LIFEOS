'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ProgramDay, Workout } from '@lifeos/shared'
import { assignProgramDays, todayDate, useRoutineStore, useWorkoutStore } from '@lifeos/shared'
import { getProgramWorkoutHistory, getUpcomingRoutineBlocks } from '@lifeos/shared/supabase'
import { supabase } from '@/lib/supabase/client'
import { useLang } from '@/lib/contexts/LangContext'
import { programDayLabel } from '@/lib/i18nFlex'

type UpcomingBlock = Awaited<ReturnType<typeof getUpcomingRoutineBlocks>>[number]

/** Başlığın sonuna program gününü ekler; ad zaten onunla bitiyorsa dokunmaz. */
export function withProgramDay(title: string, day: string | undefined): string {
  if (!day || title.endsWith(day)) return title
  return `${title} · ${day}`
}

/**
 * Programa bağlı rutinlerin bloklarına o günün program gününü verir (blok id'si → gün adı),
 * mobildeki ile aynı. Bağlı rutin yoksa hiçbir istek atılmaz; sıra yapılan antrenmana göre ilerler.
 */
export function useProgramDays(
  userId: string,
  shown: ReadonlyArray<{ id: string; routine_id: string | null }>,
): Record<string, string> {
  const { t } = useLang()
  const routines = useRoutineStore((s) => s.routines)
  const programs = useWorkoutStore((s) => s.programs)
  const [history, setHistory] = useState<Workout[]>([])
  const [blocks, setBlocks] = useState<UpcomingBlock[]>([])

  const linked = useMemo(() => routines.filter((r) => r.workout_program_id), [routines])
  // updated_at: seri düzenlenince blok kimlikleri yeniden üretilir.
  const linkedKey = linked.map((r) => `${r.id}@${r.updated_at}`).join(',')
  const linkedIds = new Set(linked.map((r) => r.id))
  const shownKey = shown.filter((b) => b.routine_id && linkedIds.has(b.routine_id)).map((b) => b.id).join(',')

  useEffect(() => {
    if (linked.length === 0) {
      setBlocks([])
      return
    }
    let cancelled = false
    const store = useWorkoutStore.getState()
    if (store.programs.length === 0) void store.fetchPrograms(supabase, userId).catch(() => undefined)
    getProgramWorkoutHistory(supabase, userId)
      .then((rows) => { if (!cancelled) setHistory(rows) })
      .catch(() => undefined)
    getUpcomingRoutineBlocks(supabase, linked.map((r) => r.id), todayDate())
      .then((rows) => { if (!cancelled) setBlocks(rows) })
      .catch(() => undefined)
    return () => { cancelled = true }
    // linked, linkedKey ile izlenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, linkedKey, shownKey])

  return useMemo(() => {
    const result: Record<string, string> = {}
    const today = todayDate()
    const label = (d: ProgramDay) => programDayLabel(d, t)
    for (const program of programs) {
      const ids = new Set(linked.filter((r) => r.workout_program_id === program.id).map((r) => r.id))
      if (ids.size === 0) continue
      const mine = blocks.filter((b) => ids.has(b.routine_id))
      for (const [blockId, day] of assignProgramDays(program, history, mine, today, label)) {
        result[blockId] = label(day)
      }
    }
    return result
  }, [programs, history, blocks, linked, t])
}
