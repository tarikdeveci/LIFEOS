import { useEffect, useMemo, useState } from 'react'
import { useRoutineStore, useWorkoutStore, assignProgramDays, todayDate } from '@lifeos/shared'
import type { Workout } from '@lifeos/shared'
import { getUpcomingRoutineBlocks, getProgramWorkoutHistory } from '@lifeos/shared/supabase'
import { supabase } from '@/src/lib/supabase'
import { useLang } from '@/src/contexts/LangContext'
import { programDayLabel } from '@/src/components/workout/programDays'

type UpcomingBlock = Awaited<ReturnType<typeof getUpcomingRoutineBlocks>>[number]

/** Başlığın sonuna program gününü ekler; ad zaten onunla bitiyorsa dokunmaz. */
export function withProgramDay(title: string, day: string | undefined): string {
  if (!day || title.endsWith(day)) return title
  return `${title} · ${day}`
}

/**
 * Programa bağlı rutinlerin bloklarına o günün program gününü verir (blok id'si → gün adı).
 * Bağlı rutin yoksa hiçbir istek atılmaz. Sıra yapılan antrenmana göre ilerler, bkz. assignProgramDays.
 * `shown`: ekranda görünen bloklar; bağlı rutinden yeni bir blok belirince (rutin kaydı, arka planda üretim)
 * bloklar ve antrenman geçmişi yeniden okunur. Tarih değiştirmek tek başına istek atmaz.
 */
export function useProgramDays(
  userId: string | null,
  shown: ReadonlyArray<{ id: string; routine_id: string | null }>,
): Record<string, string> {
  const { t } = useLang()
  const routines = useRoutineStore((s) => s.routines)
  const programs = useWorkoutStore((s) => s.programs)
  const [history, setHistory] = useState<Workout[]>([])
  const [blocks, setBlocks] = useState<UpcomingBlock[]>([])

  // Rutinler yalnız Haftalık Rutinler kartında okunuyordu; bu ekranlar tek başına açılabilir.
  useEffect(() => {
    if (!userId) return
    const store = useRoutineStore.getState()
    if (store.routines.length === 0 && !store.loading) void store.fetchRoutines(supabase, userId).catch(() => undefined)
  }, [userId])

  const linked = useMemo(() => routines.filter((r) => r.workout_program_id), [routines])
  // updated_at: seri düzenlenince blok kimlikleri yeniden üretilir.
  const linkedKey = linked.map((r) => `${r.id}@${r.updated_at}`).join(',')
  const linkedIds = new Set(linked.map((r) => r.id))
  const shownKey = shown.filter((b) => b.routine_id && linkedIds.has(b.routine_id)).map((b) => b.id).join(',')

  useEffect(() => {
    if (!userId || linked.length === 0) {
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
    const label = (d: Parameters<typeof programDayLabel>[0]) => programDayLabel(d, t)
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
