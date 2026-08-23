import { useEffect, useRef } from 'react'
import { AppState, Platform } from 'react-native'
import {
  usePlanningStore,
  useTaskStore,
  buildWidgetSnapshot,
  resolveWidgetNow,
  toDateString,
} from '@lifeos/shared'
import { showActiveBlock, hideActiveBlock } from '../../modules/live-activity'

/**
 * Aktif zaman bloğunu canlı bildirime yansıtır.
 *
 * iOS'ta Live Activity, Android'de kalıcı bildirim. Sayaç iOS tarafında sistem
 * tarafından tiklendiği için orada yalnızca blok/görev değiştiğinde güncelleme
 * gönderiyoruz; Android'de metin sabit olduğu için dakika başında tazeliyoruz.
 *
 * `useWidgetSync` ile aynı yerde (tabs layout) bir kez mount edilir.
 */

/** 'HH:MM' + gün → gerçek Date (cihazın yerel saati) */
function atClock(dayDate: string, hhmm: string): Date | null {
  const [y, mo, d] = dayDate.split('-').map(Number)
  const [h, m] = hhmm.split(':').map(Number)
  if ([y, mo, d, h, m].some((n) => !Number.isFinite(n))) return null
  return new Date(y as number, (mo as number) - 1, d as number, h as number, m as number, 0, 0)
}

export function useBlockLiveActivity(): void {
  const tasks = useTaskStore((s) => s.tasks)
  const timeBlocks = usePlanningStore((s) => s.timeBlocks)

  // En son gösterilen durumun imzası — gereksiz native çağrısı yapmamak için
  const lastKeyRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function sync() {
      const now = new Date()
      const snapshot = buildWidgetSnapshot({
        tasks: useTaskStore.getState().tasks,
        timeBlocks: usePlanningStore.getState().timeBlocks,
        caloriesConsumed: null,
        caloriesTarget: null,
        steps: null,
        stepGoal: null,
        now,
      })
      const state = resolveWidgetNow(snapshot, now)
      const block = state.currentBlock

      if (!block) {
        if (lastKeyRef.current !== null) {
          lastKeyRef.current = null
          await hideActiveBlock()
        }
        return
      }

      const dayDate = toDateString(now)
      const startsAt = atClock(dayDate, block.startTime)
      let endsAt = atClock(dayDate, block.endTime)
      if (!startsAt || !endsAt) return
      // Gece yarısını aşan blok (23:30–00:15) ertesi güne taşar
      if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 86_400_000)

      // iOS'ta sayaç kendi akıyor; imza değişmediyse dokunma.
      // Android'de kalan süre metni sabit olduğundan her turda tazeliyoruz.
      const key = `${dayDate}|${block.label}|${block.startTime}|${snapshot.pendingTasks}|${state.nextBlock?.label ?? ''}`
      if (Platform.OS === 'ios' && key === lastKeyRef.current) return
      lastKeyRef.current = key

      if (cancelled) return
      await showActiveBlock({
        label: block.label,
        blockType: block.blockType,
        startsAt,
        endsAt,
        pendingTasks: snapshot.pendingTasks,
        nextLabel: state.nextBlock?.label ?? null,
        dayDate,
      })
    }

    void sync()
    const timer = setInterval(() => void sync(), 60_000)
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void sync()
    })

    return () => {
      cancelled = true
      clearInterval(timer)
      sub.remove()
    }
  }, [tasks, timeBlocks])
}
