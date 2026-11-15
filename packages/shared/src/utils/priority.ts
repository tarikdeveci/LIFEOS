import type { WsjfScores } from '../types/task'

/**
 * WSJF (Weighted Shortest Job First) skoru hesaplar.
 * priority_score = (value + urgency + risk) / (effort + friction)
 * Tüm parametreler 1-5 arası.
 *
 * DB'de GENERATED ALWAYS AS STORED kolonu olarak tutulur.
 * Bu fonksiyon client-side preview için kullanılır (slider değiştikçe anlık hesap).
 */
export function calculateWsjf(scores: WsjfScores): number {
  const numerator = scores.value_score + scores.urgency_score + scores.risk_score
  const denominator = scores.effort_score + scores.friction_score

  if (denominator === 0) return 0
  return Math.round((numerator / denominator) * 100) / 100
}

/**
 * WSJF skoru → insan okunabilir öncelik seviyesi
 */
export function wsjfToPriorityLabel(score: number): 'critical' | 'high' | 'medium' | 'low' {
  if (score >= 2.0) return 'critical'
  if (score >= 1.5) return 'high'
  if (score >= 1.0) return 'medium'
  return 'low'
}

/**
 * Kullanıcı önceliği ayarladı mı: beş skordan biri varsayılandan farklıysa evet.
 * Varsayılan görev 1.5 ile "high" etiketine düştüğü için etiket yalnız bu durumda gösterilir.
 */
export function hasCustomPriority(scores: WsjfScores): boolean {
  return (Object.keys(DEFAULT_WSJF_SCORES) as (keyof WsjfScores)[])
    .some((key) => scores[key] !== DEFAULT_WSJF_SCORES[key])
}

/**
 * Default WSJF skorları
 */
export const DEFAULT_WSJF_SCORES: WsjfScores = {
  value_score: 3,
  urgency_score: 3,
  risk_score: 3,
  effort_score: 3,
  friction_score: 3,
}

interface PendingTaskLike {
  status: string
  priority_score: number
  scheduled_date: string | null
  due_date: string | null
}

/** Görevin takvimdeki en erken tarihi (planlanan ya da son tarih); ikisi de yoksa null. */
export function taskDateKey(task: Pick<PendingTaskLike, 'scheduled_date' | 'due_date'>): string | null {
  const dates = [task.scheduled_date, task.due_date].filter((d): d is string => !!d)
  if (dates.length === 0) return null
  return dates.reduce((a, b) => (a <= b ? a : b))
}

/**
 * Bugün ve Planlama'da gösterilen en yakın bekleyen görev (#33). Açık görevler (bitmemiş,
 * ertelenmemiş, engelli olmayan) arasından tarihi olanlar en erken tarihle gelir: geciken önce,
 * sonra bugün, sonra ilk gelecek gün. Tarihli görev yoksa en yüksek öncelikli tarihsiz görev.
 * Aynı tarihte yüksek WSJF önce.
 */
export function nearestPendingTask<T extends PendingTaskLike>(tasks: readonly T[]): T | null {
  let best: T | null = null
  let bestKey: string | null = null
  for (const task of tasks) {
    if (task.status === 'done' || task.status === 'deferred' || task.status === 'blocked') continue
    const key = taskDateKey(task)
    if (!best) { best = task; bestKey = key; continue }
    const better =
      key !== null && bestKey === null ? true
        : key === null && bestKey !== null ? false
          : key !== bestKey ? (key as string) < (bestKey as string)
            : task.priority_score > best.priority_score
    if (better) { best = task; bestKey = key }
  }
  return best
}
