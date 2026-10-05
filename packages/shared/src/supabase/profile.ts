import type { SupabaseClient } from '@supabase/supabase-js'
import type { PlanningRules } from '../types/user'
import { resolvePlanningRules } from '../utils/planningRules'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any>

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

async function readPreferences(supabase: Supabase, userId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('preferences')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data ? asRecord(data.preferences) : null
}

/**
 * Kuralları günceller: yalnızca patch'teki alanlar değişir, sonuç sınırlanıp tam nesne olarak
 * yazılır. preferences JSONB'sinde tema, e-posta saatleri gibi ilgisiz anahtarlar da var:
 * okuma-birleştirme-yazma şart, düz update onları siler (bkz. updateEmailPreferences).
 */
export async function updatePlanningRules(
  supabase: Supabase,
  userId: string,
  patch: Partial<PlanningRules>,
): Promise<PlanningRules> {
  const prefs = await readPreferences(supabase, userId)
  // Profil satırı yoksa update sessizce 0 satır etkiler; kural kaydedildi sanılmasın.
  if (!prefs) throw new Error('profile_not_found')

  const defined = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<PlanningRules>
  const next = resolvePlanningRules({ ...asRecord(prefs['planning']), ...defined } as Partial<PlanningRules>)

  const { error } = await supabase
    .from('user_profiles')
    .update({ preferences: { ...prefs, planning: next } })
    .eq('id', userId)

  if (error) throw error
  return next
}
