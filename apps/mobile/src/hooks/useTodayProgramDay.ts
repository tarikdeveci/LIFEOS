import { useEffect, useMemo, useState } from 'react'
import { pickTodayProgramDay, todayDate, useWorkoutStore } from '@lifeos/shared'
import type { TodayProgramDay } from '@lifeos/shared'
import { getTimeBlocks } from '@lifeos/shared/supabase'
import { supabase } from '@/src/lib/supabase'
import { useLang } from '@/src/contexts/LangContext'
import { programDayLabel } from '@/src/components/workout/programDays'
import { useAssignedProgramDays } from './useProgramDays'

const NO_BLOCKS: ReadonlyArray<{ id: string; routine_id: string | null }> = []

/**
 * Bugünün program günü: programa bağlı rutinin bugünkü bloğuna düşen gün (Bugün ekranındaki
 * etiketle aynı hesap), yoksa bugünkü workout bloğunun adından bulunan gün, yoksa null.
 * `refreshKey` değişince (antrenman başladı ya da silindi) yeniden okunur.
 */
export function useTodayProgramDay(userId: string | null, refreshKey: string): TodayProgramDay | null {
  const { t } = useLang()
  const programs = useWorkoutStore((s) => s.programs)
  const assigned = useAssignedProgramDays(userId, NO_BLOCKS, refreshKey)
  const [blockLabels, setBlockLabels] = useState<string[]>([])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    getTimeBlocks(supabase, userId, todayDate())
      .then((rows) => {
        if (cancelled) return
        setBlockLabels(rows.filter((b) => b.block_type === 'workout' && b.label).map((b) => b.label as string))
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [userId, refreshKey])

  return useMemo(() => {
    const today = todayDate()
    const routineDays = assigned
      .filter((a) => a.date === today)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
    return pickTodayProgramDay(programs, routineDays, blockLabels, (d) => programDayLabel(d, t))
  }, [assigned, programs, blockLabels, t])
}
