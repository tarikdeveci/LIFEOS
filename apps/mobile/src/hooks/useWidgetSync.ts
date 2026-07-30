import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import {
  useTaskStore,
  usePlanningStore,
  useNutritionStore,
  buildWidgetSnapshot,
} from '@lifeos/shared'
import { useHealthStore } from '../stores/healthStore'
import { persistWidgetSnapshot } from '../widgets/storage'

/**
 * Store'lardaki değişimi widget snapshot'ına yansıtır.
 *
 * Tabs layout'ta bir kez mount edilir — tab değiştirse de kalır. Store
 * değişimlerinde ve dakika başında (aktif blok ilerlemesi için) yeniden yazar.
 * Yazma ucuz değil (native köprü), bu yüzden içerik gerçekten değişmediyse
 * atlanır.
 */
export function useWidgetSync(): void {
  const tasks = useTaskStore((s) => s.tasks)
  const timeBlocks = usePlanningStore((s) => s.timeBlocks)
  const meals = useNutritionStore((s) => s.meals)
  const dailySummary = useNutritionStore((s) => s.dailySummary)
  const target = useNutritionStore((s) => s.target)
  const healthToday = useHealthStore((s) => s.today)
  const healthSettings = useHealthStore((s) => s.settings)

  const lastJsonRef = useRef<string | null>(null)

  useEffect(() => {
    const caloriesConsumed =
      dailySummary?.calories ??
      (meals.length > 0 ? meals.reduce((sum, m) => sum + (m.total_calories ?? 0), 0) : null)

    const stepGoal = healthSettings?.enabled ? healthSettings.step_goal : null
    const steps = healthSettings?.enabled ? healthToday?.steps ?? null : null

    const snapshot = buildWidgetSnapshot({
      tasks,
      timeBlocks,
      caloriesConsumed,
      caloriesTarget: target?.calories ?? null,
      steps,
      stepGoal,
    })

    // updatedAt her seferinde değişir; onu hariç tutup içerik karşılaştır
    const { updatedAt: _updatedAt, ...comparable } = snapshot
    const json = JSON.stringify(comparable)
    if (json === lastJsonRef.current) return
    lastJsonRef.current = json

    void persistWidgetSnapshot(snapshot)
  }, [tasks, timeBlocks, meals, dailySummary, target, healthToday, healthSettings])

  // Dakika başında ve foreground'a dönüşte tazele (aktif blok kalan süresi
  // store değişmese de akıyor)
  useEffect(() => {
    function refresh() {
      lastJsonRef.current = null // içerik aynı olsa bile yeniden yaz
      const caloriesConsumed =
        useNutritionStore.getState().dailySummary?.calories ??
        (useNutritionStore.getState().meals.reduce((sum, m) => sum + (m.total_calories ?? 0), 0) || null)
      const settings = useHealthStore.getState().settings
      const snapshot = buildWidgetSnapshot({
        tasks: useTaskStore.getState().tasks,
        timeBlocks: usePlanningStore.getState().timeBlocks,
        caloriesConsumed,
        caloriesTarget: useNutritionStore.getState().target?.calories ?? null,
        steps: settings?.enabled ? useHealthStore.getState().today?.steps ?? null : null,
        stepGoal: settings?.enabled ? settings.step_goal : null,
      })
      void persistWidgetSnapshot(snapshot)
    }

    const timer = setInterval(refresh, 60_000)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh()
    })
    return () => {
      clearInterval(timer)
      sub.remove()
    }
  }, [])
}
