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
 * Default WSJF skorları
 */
export const DEFAULT_WSJF_SCORES: WsjfScores = {
  value_score: 3,
  urgency_score: 3,
  risk_score: 3,
  effort_score: 3,
  friction_score: 3,
}
