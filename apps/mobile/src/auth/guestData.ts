import { supabase } from '@/src/lib/supabase'
import { collectGuestCounts, decideSwitchWarning, type SwitchWarning } from './switchWarning'

/** Sayım bu süreden uzun sürerse uyarı sayısız gösterilir; giriş akışı beklemez. */
const COUNT_TIMEOUT_MS = 3000

async function headCount(table: 'tasks' | 'meals' | 'time_blocks' | 'workouts', userId: string): Promise<number> {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true }).eq('user_id', userId)
  if (error || count === null) throw error ?? new Error('count unavailable')
  return count
}

/** Misafir hesapta kaybolacak verinin uyarı türü: yok, sayılı ya da sayılamadı. */
export async function loadGuestSwitchWarning(userId: string): Promise<SwitchWarning> {
  const counts = await collectGuestCounts({
    tasks: () => headCount('tasks', userId),
    meals: () => headCount('meals', userId),
    blocks: () => headCount('time_blocks', userId),
    workouts: () => headCount('workouts', userId),
  }, COUNT_TIMEOUT_MS)
  return decideSwitchWarning(counts)
}
