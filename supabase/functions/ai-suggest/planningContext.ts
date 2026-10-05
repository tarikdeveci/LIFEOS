// supabase/functions/ai-suggest/planningContext.ts
// Planlama koçunun kullanıcıya özel bağlamı: kalıcı kurallar ve rutin blokları (065).
// daily_report rotası da aynı kural okuyucusunu kullanır.

import {
  routineBlockContext,
  type ProtectedBlock,
  type MinVersionBlock,
  type RoutineBlockRow,
  type RoutineRuleRow,
} from '../_shared/ai/planner.ts'
import { parsePlanningRules, type PlanningRules } from '../_shared/ai/planningRules.ts'
import { isRecord } from '../_shared/ai/sanitize.ts'
import type { RouteContext } from './request.ts'

type Db = RouteContext['supabase']

/** PostgreSQL undefined_column: 065 henüz uygulanmamış. */
const UNDEFINED_COLUMN = '42703'

/**
 * user_profiles.preferences.planning. Kurallar ek bağlamdır: okunamazsa istek
 * düşmez, kullanıcı hiç kural koymamış gibi varsayılanlarla devam edilir.
 */
export async function loadPlanningRules(supabase: Db, userId: string): Promise<Partial<PlanningRules>> {
  const { data, error } = await supabase.from('user_profiles').select('preferences').eq('id', userId).maybeSingle()
  if (error) {
    console.error('planlama kuralları okunamadı:', error.message)
    return {}
  }
  const preferences = (data as { preferences?: unknown } | null)?.preferences
  return parsePlanningRules(isRecord(preferences) ? preferences['planning'] : undefined)
}

export interface RoutineContext {
  protectedBlocks: ProtectedBlock[]
  minVersions: MinVersionBlock[]
}

const NO_ROUTINES: RoutineContext = { protectedBlocks: [], minVersions: [] }

/**
 * O günün korumalı rutin blokları ve düşük enerji için asgari sürümleri.
 *
 * Korumalı blok güvencesi olduğu için okuma hatası isteği düşürür: sessizce
 * korumasız devam etmek kullanıcının "iş yüzünden iptal edilmesin" dediği bloğu
 * riske atar. Tek istisna 065 öncesi: kolonlar yokken korumalı rutin de yoktur,
 * fonksiyon migration'dan önce deploy edilirse replan bozulmamalı.
 */
export async function loadRoutineContext(
  supabase: Db,
  userId: string,
  date: string,
  planningCutoff: string,
): Promise<RoutineContext> {
  const [routineResult, blockResult] = await Promise.all([
    supabase
      .from('routines')
      .select('id, is_protected, min_minutes')
      .eq('user_id', userId)
      .or('is_protected.eq.true,min_minutes.not.is.null'),
    supabase
      .from('time_blocks')
      .select('id, routine_id, label, start_time, end_time')
      .eq('user_id', userId)
      .eq('date', date)
      .not('routine_id', 'is', null),
  ])

  if (routineResult.error) {
    if (routineResult.error.code === UNDEFINED_COLUMN) return NO_ROUTINES
    throw new Error(`routines okunamadı: ${routineResult.error.message}`)
  }
  if (blockResult.error) throw new Error(`time_blocks okunamadı: ${blockResult.error.message}`)

  return routineBlockContext(
    (blockResult.data ?? []) as RoutineBlockRow[],
    (routineResult.data ?? []) as RoutineRuleRow[],
    planningCutoff,
  )
}
