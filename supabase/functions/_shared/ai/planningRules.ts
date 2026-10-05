// supabase/functions/_shared/ai/planningRules.ts
//
// Kullanıcının kalıcı planlama kuralları (user_profiles.preferences.planning).
// Tip ve sınırlar packages/shared/src/types/user.ts ile utils/planningRules.ts'teki
// PlanningRules'un aynısı; edge function'lar o paketi içe aktaramadığı için burada
// yineleniyor. Alanlardan biri değişirse iki yer birlikte değişir.

import { clampInt, cleanText, isRecord } from './sanitize.ts'

export type RolloverMode = 'carry' | 'backlog'

export interface PlanningRules {
  /** Bir günde en çok kaç önemli zihinsel iş (1-5). */
  max_deep_tasks: number
  /** Kaçan görev: 'carry' bugüne taşınır, 'backlog' günden çıkar. */
  rollover: RolloverMode
  /** Bloklar arası tampon (dk, 0-60). */
  buffer_minutes: number
  /** Kullanıcının kendi cümleleriyle kuralları; en çok PLANNING_ABOUT_MAX karakter. */
  about: string
}

export const DEFAULT_PLANNING_RULES: PlanningRules = {
  max_deep_tasks: 3,
  rollover: 'carry',
  buffer_minutes: 15,
  about: '',
}

export const PLANNING_ABOUT_MAX = 2000

/**
 * Ham değerden (veritabanındaki JSONB ya da modelin ürettiği nesne) yalnızca geçerli
 * alanları alır; eksik ya da geçersiz alan sonuçta yer almaz. Varsayılan doldurmak
 * çağıranın işi: "kullanıcı bunu hiç seçmedi" ile "varsayılanı seçti" ayırt edilebilsin.
 */
export function parsePlanningRules(raw: unknown): Partial<PlanningRules> {
  if (!isRecord(raw)) return {}
  const rules: Partial<PlanningRules> = {}

  const deep = clampInt(raw['max_deep_tasks'], 1, 5)
  if (deep !== undefined) rules.max_deep_tasks = deep

  const buffer = clampInt(raw['buffer_minutes'], 0, 60)
  if (buffer !== undefined) rules.buffer_minutes = buffer

  if (raw['rollover'] === 'carry' || raw['rollover'] === 'backlog') rules.rollover = raw['rollover']

  const about = cleanText(raw['about'], PLANNING_ABOUT_MAX)
  if (about !== '') rules.about = about

  return rules
}
