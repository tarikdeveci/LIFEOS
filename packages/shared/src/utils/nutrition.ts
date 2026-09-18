import type { Macros, MacroProgress, MealItem, NutritionTarget } from '../types/nutrition'

// ============================
// TDEE / BMR hesaplama
// ============================

export type ActivityLevel =
  | 'sedentary'
  | 'lightly_active'
  | 'moderately_active'
  | 'very_active'
  | 'extra_active'

export type FitnessGoal = 'general' | 'muscle_gain' | 'fat_loss'

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: '🪑 Hareketsiz (Masabaşı)',
  lightly_active: '🚶 Hafif Aktif (1-3 gün)',
  moderately_active: '🏃 Orta Aktif (3-5 gün)',
  very_active: '💪 Çok Aktif (6-7 gün)',
  extra_active: '🔥 Ekstra Aktif (2x/gün)',
}

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
}

/**
 * Mifflin-St Jeor formülü ile BMR hesapla, aktivite çarpanı ile TDEE üret.
 *
 * Harris-Benedict (1919) yerine Mifflin-St Jeor (1990): günümüz nüfusunda
 * dinlenme harcamasını daha az sapmayla tahmin ettiği gösterilen denklem.
 * Bu yine de yalnızca başlangıç tahmini; gerçek harcama kilo değişiminden
 * öğrenilir (bkz. adaptiveTdee.ts).
 */
export function calculateTDEE(params: {
  weight_kg: number
  height_cm: number
  age: number
  gender: 'male' | 'female'
  activity_level: ActivityLevel
}): number {
  const { weight_kg, height_cm, age, gender, activity_level } = params

  const base = 10 * weight_kg + 6.25 * height_cm - 5 * age
  const bmr = gender === 'male' ? base + 5 : base - 161

  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activity_level])
}

/**
 * TDEE ve hedefe göre makro önerisi üret
 */
export function suggestMacrosFromTDEE(
  tdee: number,
  goal: FitnessGoal,
): { calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number } {
  let calories = tdee

  if (goal === 'fat_loss') calories = Math.round(tdee * 0.8)
  if (goal === 'muscle_gain') calories = Math.round(tdee * 1.1)

  const proteinRatio = goal === 'fat_loss' ? 0.35 : goal === 'muscle_gain' ? 0.30 : 0.25
  const fatRatio = 0.25
  const carbRatio = 1 - proteinRatio - fatRatio

  return {
    calories,
    protein_g: Math.round((calories * proteinRatio) / 4),
    carbs_g: Math.round((calories * carbRatio) / 4),
    fat_g: Math.round((calories * fatRatio) / 9),
    fiber_g: goal === 'fat_loss' ? 35 : 25,
  }
}

// ============================
// Mevcut yardımcılar
// ============================

/**
 * MacroProgress hesapla (hedef vs gerçek)
 */
export function calculateMacroProgress(current: number, target: number): MacroProgress {
  const percentage = target > 0 ? Math.round((current / target) * 100) : 0

  return {
    current,
    target,
    percentage,
    status: percentage < 80 ? 'low' : percentage <= 110 ? 'ok' : 'over',
  }
}

/**
 * Makro özetini hedefle karşılaştır
 */
export function compareMacrosToTarget(
  totals: Macros,
  target: NutritionTarget,
): Record<keyof Macros, MacroProgress> {
  return {
    calories: calculateMacroProgress(totals.calories, target.calories),
    protein: calculateMacroProgress(totals.protein, target.protein),
    carbs: calculateMacroProgress(totals.carbs, target.carbs),
    fat: calculateMacroProgress(totals.fat, target.fat),
    fiber: calculateMacroProgress(totals.fiber, target.fiber),
  }
}

/**
 * Kalori kalan hesapla
 */
export function remainingCalories(currentCalories: number, targetCalories: number): number {
  return Math.max(0, targetCalories - currentCalories)
}

/**
 * Makro değerlerini topla
 */
export function sumMacros(items: Macros[]): Macros {
  return items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein: acc.protein + item.protein,
      carbs: acc.carbs + item.carbs,
      fat: acc.fat + item.fat,
      fiber: acc.fiber + item.fiber,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  )
}

/**
 * Gram → kalori dönüştürücüler (Atwater faktörleri)
 */
export const KCAL_PER_G = {
  protein: 4,
  carbs: 4,
  fat: 9,
  fiber: 2,
} as const

// ============================
// Kalem miktarını elle değiştirme
// ============================

/**
 * Elle girilen gramaj: tartılmadı ama BEYAN EDİLDİ. Hattın kendi tahmininden
 * (±%25–40) çok daha dar, tartımdan (±%2) biraz geniş.
 */
export const USER_SET_TOLERANCE = 0.05

/**
 * Kalemin gramajı elle değiştirildiğinde besin değerini yeniden ORANLAR.
 *
 * İki kural bu fonksiyonun tamamını açıklar:
 *
 * 1. Yeni bir tahmin ÜRETİLMEZ. Kullanıcı 200 g'ı 750 g'a çektiğinde soru
 *    "750 g levrek kaç kalori" değil, "aynı satırın 3.75 katı ne eder"dir.
 *    Referans satır değişmediği için oranlamak yeterli ve doğrudur.
 *
 * 2. Ölçekleme her zaman ORİJİNAL kalemden yapılır, bir önceki düzenlemeden
 *    değil. Zincirleme oranlama her adımda yuvarlama hatasını taşır: "2" → "20"
 *    → "200" yazan biri üç kez yuvarlanmış bir sayı elde eder. Çağıran taraf bu
 *    yüzden düzenlenmemiş kalemi saklamalı ve her tuşta onu geçmelidir.
 *
 * Bant ±%5'e daralır ve basamak `user_memory` olur: bu artık sistemin tahmini
 * değil, kullanıcının beyanıdır.
 */
export function rescaleItemToAmount(base: MealItem, nextAmount: number): MealItem {
  if (!Number.isFinite(nextAmount) || nextAmount <= 0) return base

  // Hattan gelen kalemlerde miktar gramdır (grams alanı dolu). Elle eklenen
  // satırlarda birim 'adet'/'dilim' olabilir; orada oran amount üstünden kurulur.
  const current = base.grams && base.grams > 0 ? base.grams : base.amount || 1
  const factor = nextAmount / current

  const calories = Math.round(base.calories * factor)
  const round1 = (value: number) => Math.round(value * factor * 10) / 10

  const scaled: MealItem = {
    ...base,
    amount: Math.round(nextAmount * 10) / 10,
    calories,
    protein: round1(base.protein),
    carbs: round1(base.carbs),
    fat: round1(base.fat),
    fiber: round1(base.fiber),
  }

  // Hattan gelmeyen kalemde grams/bant alanları yok; uydurmuyoruz.
  if (base.grams === undefined) return scaled

  return {
    ...scaled,
    unit: base.unit === 'ml' ? 'ml' : 'g',
    grams: Math.round(nextAmount * 10) / 10,
    calories_min: Math.round(calories * (1 - USER_SET_TOLERANCE)),
    calories_max: Math.round(calories * (1 + USER_SET_TOLERANCE)),
    portion_rung: 'user_memory',
    portion_tolerance: USER_SET_TOLERANCE,
  }
}

/**
 * Yiyecek ifadesini alias/porsiyon hafızası anahtarına çevirir.
 *
 * ÖNEMLİ: Bu fonksiyon `supabase/functions/_shared/nutrition/normalize.ts`
 * içindeki `normalizePhrase` ile BİREBİR aynı sonucu vermek zorunda — anahtarlar
 * iki taraf arasında paylaşılıyor. Deno edge function workspace paketini import
 * edemediği için mantık iki yerde duruyor; birini değiştiren diğerini de değiştirmeli.
 */
export function normalizeFoodPhrase(input: string): string {
  const foldMap: Record<string, string> = {
    ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g',
    ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c',
    â: 'a', î: 'i', û: 'u', é: 'e', è: 'e', á: 'a', ñ: 'n',
  }
  const lowered = input.toLocaleLowerCase('tr')
  let folded = ''
  for (const ch of lowered) folded += foldMap[ch] ?? ch

  return folded
    .replace(/[^a-z0-9%\s.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
