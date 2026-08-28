// Aritmetik. Bu dosya hattaki TEK besin değeri üreticisidir ve yalnızca bir
// veritabanı satırını okur: per100g × gram / 100.
//
// "AI kalori uydurdu" hatasının bu sistemde bulunmamasının sebebi burası: kalem
// bir `FoodRef` taşımıyorsa hesaplanamaz, hesaplanamayan kalem de sonuç listesine
// giremez — soruya dönüşür.

import type {
  Disposition,
  ExtractedItem,
  FoodRef,
  ParsedMealItem,
  Portion,
  Resolution,
} from './types.ts'

function round0(value: number): number {
  return Math.round(value)
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/** Besin değeri taşıyabilmek için gereken izlenebilirlik koşulu. */
export function isTraceable(ref: FoodRef | null, portion: Portion): boolean {
  if (!ref || !portion.grams) return false
  const { kcal } = ref.per100g
  return Number.isFinite(kcal) && kcal >= 0 && portion.grams.likely > 0
}

export function computeItem(
  item: ExtractedItem,
  resolution: Resolution,
  portion: Portion,
  confidence: number,
  disposition: Disposition,
): ParsedMealItem {
  const ref = resolution.ref
  if (!ref || !portion.grams) {
    // Buraya gelinmemeli: çağıran taraf isTraceable ile eler. Sessizce sıfır
    // döndürmek yerine patlıyoruz, çünkü sessiz sıfır loglara doğru gibi girer.
    throw new Error('computeItem: izlenebilir referans veya gramaj yok')
  }

  const grams = portion.grams
  const factor = grams.likely / 100
  const per = ref.per100g

  return {
    name: ref.label,
    amount: portion.displayAmount,
    unit: portion.displayUnit,
    calories: round0(per.kcal * factor),
    protein: round1(per.protein * factor),
    carbs: round1(per.carbs * factor),
    fat: round1(per.fat * factor),
    fiber: round1(per.fiber * factor),
    ...(ref.kind === 'curated' ? { food_item_id: ref.id } : { corpus_fdc_id: ref.id }),

    grams: round1(grams.likely),
    calories_min: round0((per.kcal * grams.min) / 100),
    calories_max: round0((per.kcal * grams.max) / 100),
    source: ref.kind,
    resolve_rung: resolution.rung,
    portion_rung: portion.rung,
    portion_tolerance: portion.tolerance,
    confidence: Math.round(confidence * 100) / 100,
    disposition,
    phrase: item.phrase,
  }
}

export function sumTotals(items: ParsedMealItem[]) {
  return {
    total_calories: round0(items.reduce((sum, i) => sum + i.calories, 0)),
    total_protein: round1(items.reduce((sum, i) => sum + i.protein, 0)),
    total_carbs: round1(items.reduce((sum, i) => sum + i.carbs, 0)),
    total_fat: round1(items.reduce((sum, i) => sum + i.fat, 0)),
    total_fiber: round1(items.reduce((sum, i) => sum + i.fiber, 0)),
    total_calories_min: round0(items.reduce((sum, i) => sum + i.calories_min, 0)),
    total_calories_max: round0(items.reduce((sum, i) => sum + i.calories_max, 0)),
  }
}
