// Adaptif kalori hedefi: kilo + alım geçmişini okuyup utils/adaptiveTdee.ts'e verir
import type { SupabaseClient } from '@supabase/supabase-js'
import { shiftIsoDate, todayDate } from '../utils/date'
import {
  computeAdaptiveTdee,
  initialExpenditureEstimate,
  profileFromPreferences,
  type AdaptiveTdeeResult,
  type DailyIntake,
  type TdeeProposal,
} from '../utils/adaptiveTdee'
import { getWeightLogs, type WeightPoint } from './health'
import { getNutritionTarget } from './nutrition'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any>

/** Filtrenin geriye baktığı gün sayısı. */
export const ADAPTIVE_TDEE_WINDOW_DAYS = 90

/** Son `days` günün günlük toplam alımı (öğün kaydı olan günler), tarihe göre artan. */
export async function getDailyIntake(
  supabase: Supabase,
  userId: string,
  days = ADAPTIVE_TDEE_WINDOW_DAYS,
  endDate: string = todayDate(),
): Promise<DailyIntake[]> {
  const { data, error } = await supabase
    .from('meals')
    .select('date, total_calories')
    .eq('user_id', userId)
    .gte('date', shiftIsoDate(endDate, -(days - 1)))
    .lte('date', endDate)
    .order('date')
    .limit(5000)

  if (error) throw error
  const byDate = new Map<string, number>()
  for (const row of (data ?? []) as Array<{ date: string; total_calories: number | null }>) {
    byDate.set(row.date, (byDate.get(row.date) ?? 0) + Number(row.total_calories ?? 0))
  }
  return [...byDate.entries()].map(([date, kcal]) => ({ date, kcal }))
}

export interface AdaptiveTdeeData {
  result: AdaptiveTdeeResult
  /** Hesaba giren tartılar (tarihe göre artan); grafik ve geçmiş listesi aynı okumayı kullanır. */
  weighIns: WeightPoint[]
  /** Profildeki kilo: hiç tartı yokken giriş alanının başlangıç değeri. */
  profileWeightKg: number | null
}

/**
 * Kilo geçmişi, alım geçmişi, mevcut hedef ve profilden adaptif harcama
 * tahmini. Başlangıç harcaması pencerenin ilk tartısıyla hesaplanır: filtre o
 * günden başlıyor.
 */
export async function loadAdaptiveTdee(
  supabase: Supabase,
  userId: string,
  endDate: string = todayDate(),
): Promise<AdaptiveTdeeData> {
  const [weighIns, intake, target, profileRow] = await Promise.all([
    getWeightLogs(supabase, userId, ADAPTIVE_TDEE_WINDOW_DAYS, endDate),
    getDailyIntake(supabase, userId, ADAPTIVE_TDEE_WINDOW_DAYS, endDate),
    getNutritionTarget(supabase, userId),
    supabase.from('user_profiles').select('preferences').eq('id', userId).maybeSingle(),
  ])
  if (profileRow.error) throw profileRow.error

  const profile = profileFromPreferences((profileRow.data as { preferences: unknown } | null)?.preferences)
  const targetCalories = target?.calories ?? null
  const result = computeAdaptiveTdee({
    weighIns,
    intake,
    endDate,
    initialExpenditure: initialExpenditureEstimate(profile, targetCalories, weighIns[0]?.weightKg ?? null),
    targetCalories,
    goal: profile.goal,
  })
  return { result, weighIns, profileWeightKg: profile.weight_kg }
}

/**
 * Öneriyi aktif beslenme hedefine yazar; lif hedefi korunur. Aktif hedef yoksa
 * öneriyle oluşturulur.
 */
export async function applyTdeeProposal(supabase: Supabase, userId: string, proposal: TdeeProposal): Promise<void> {
  const payload = {
    calories: proposal.calories,
    protein_g: proposal.protein_g,
    carbs_g: proposal.carbs_g,
    fat_g: proposal.fat_g,
  }
  const { data: existing, error: readError } = await supabase
    .from('nutrition_targets')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()
  if (readError) throw readError

  const { error } = existing
    ? await supabase.from('nutrition_targets').update(payload).eq('id', (existing as { id: string }).id)
    : await supabase.from('nutrition_targets').insert({ user_id: userId, is_active: true, ...payload })
  if (error) throw error
}
