// supabase/functions/parse-meal/plan.ts
//
// Model katmaninin acilip acilmayacagi karari. Saf fonksiyon: kapı sonucundan
// baska girdisi yok, o yuzden Node testiyle dogrulanir.

import type { AiAccess } from '../_shared/ai/usage.ts'

export interface MealAiPlan {
  /** Abone ya da deneme kullanicisi mi. */
  pro: boolean
  /** Model katmani calistirilsin mi. */
  useModel: boolean
  /** Sert kota (kotuye kullanim siniri) doldu: yalnizca kural katmani. */
  limited: boolean
}

/**
 * Aylik butce asimi (`overBudget`) model katmanini KAPATMAZ: model secimi
 * `generate` icinde yedek (ucuz) modele gecer. Yalnizca sert sinir
 * (`allowed: false`) kural katmanina dusurur. Ogun kaydi hicbir kosulda durmaz.
 */
export function planMealAi(access: AiAccess): MealAiPlan {
  const pro = access.tier !== 'free'
  const limited = pro && !access.allowed
  return { pro, useModel: pro && access.allowed, limited }
}
