// Veritabanı satırlarını tek bir `FoodRef` biçimine indirger.
//
// Kritik nokta: `per100g` yalnızca burada üretilir. food_items makroları
// `serving_size` başınadır (30 g peynir = 80 kcal), food_corpus ise zaten
// 100 g başınadır. İki katmanın aritmetiği bu dönüşümden sonra aynıdır.

import type { CorpusFood, CuratedFood, FoodRef, Per100g } from './types.ts'

/** food_items satırının porsiyon başına makrolarını 100 g tabanına çevirir. */
export function per100gFromCurated(food: CuratedFood): Per100g {
  const size = food.serving_size > 0 ? food.serving_size : 100
  const factor = 100 / size
  return {
    kcal: food.calories * factor,
    protein: food.protein * factor,
    carbs: food.carbs * factor,
    fat: food.fat * factor,
    fiber: food.fiber * factor,
  }
}

export function curatedRef(food: CuratedFood): FoodRef {
  return {
    kind: 'curated',
    id: food.id,
    label: food.name,
    per100g: per100gFromCurated(food),
    servingSize: food.serving_size > 0 ? food.serving_size : 100,
    servingUnit: food.serving_unit || 'g',
    isCountable: food.is_countable === true,
    measureGrams: [],
  }
}

export function corpusRef(row: CorpusFood): FoodRef {
  return {
    kind: 'corpus',
    id: row.fdc_id,
    label: row.description,
    per100g: {
      kcal: Number(row.kcal),
      protein: Number(row.protein),
      carbs: Number(row.carbs),
      fat: Number(row.fat),
      fiber: Number(row.fiber),
    },
    // Korpusta küratörlü bir porsiyon tanımı yok. FDC ev ölçüsü bildirdiyse onu
    // kullanırız, yoksa porsiyon merdiveni bu boşluğu bilerek soru olarak bırakır.
    servingSize: row.measure_grams.length > 0 ? Number(row.measure_grams[0]) : null,
    servingUnit: 'g',
    isCountable: false,
    measureGrams: row.measure_grams.map(Number).filter((g) => Number.isFinite(g) && g > 0),
  }
}
