// Kalıcı planlama kuralları: eksik alanları varsayılanla doldurur, sınırlar.
// user_profiles.preferences.planning elle düzenlenmiş ya da AI'den gelmiş olabilir;
// sabah özeti, gece devri ve AI çağrıları buradan geçen değeri okur.

import { DEFAULT_PLANNING_RULES, PLANNING_ABOUT_MAX } from '../types/user'
import type { PlanningRules } from '../types/user'

const DEEP_TASKS_MIN = 1
const DEEP_TASKS_MAX = 5
const BUFFER_MIN = 0
const BUFFER_MAX = 60

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

/**
 * Kuralları tam ve geçerli hale getirir.
 * - max_deep_tasks 1..5, buffer_minutes 0..60 tam sayı; sayı olmayan varsayılana düşer.
 * - rollover yalnızca 'carry' | 'backlog'.
 * - about kırpılır, en çok PLANNING_ABOUT_MAX karakter (JSONB'ye yarım vekil çifti yazılmasın
 *   diye karakter sayılarak kesilir).
 */
export function resolvePlanningRules(partial: Partial<PlanningRules> | null | undefined): PlanningRules {
  const given: Partial<PlanningRules> = partial !== null && typeof partial === 'object' ? partial : {}
  return {
    max_deep_tasks: clampInt(given.max_deep_tasks, DEEP_TASKS_MIN, DEEP_TASKS_MAX, DEFAULT_PLANNING_RULES.max_deep_tasks),
    rollover: given.rollover === 'carry' || given.rollover === 'backlog'
      ? given.rollover
      : DEFAULT_PLANNING_RULES.rollover,
    buffer_minutes: clampInt(given.buffer_minutes, BUFFER_MIN, BUFFER_MAX, DEFAULT_PLANNING_RULES.buffer_minutes),
    about: typeof given.about === 'string'
      ? Array.from(given.about.trim()).slice(0, PLANNING_ABOUT_MAX).join('')
      : DEFAULT_PLANNING_RULES.about,
  }
}
