// Miktar merdiveni: "ne kadar yedi?"
//
// Kimlik ve miktar iki ayrı sorudur ve kalori hatasının büyük kısmı ikincisinde
// yaşar. Bu yüzden miktar da aynı muameleyi görür: soruyu TAM cevaplayabilecek en
// ucuz yönteme yönlendir, hiçbiri cevaplayamıyorsa tahmin yürütme — sor.
//
// Her basamak cevaplayamadığında `null` döner, böylece bir alt basamağa düşmek
// kaza değil karardır. Dönen değer tek sayı değil ARALIKTIR; aralığın genişliğini
// hangi basamağın cevapladığı belirler.

import { unitInfo } from './normalize.ts'
import type { ExtractedItem, FoodRef, Interval, Portion, PortionEstimator, PortionRung } from './types.ts'

/** Basamak başına varsayılan tolerans (± oran). Ev ölçüsünde birim kendi yayılımını taşır. */
export const PORTION_TOLERANCE: Record<PortionRung, number> = {
  stated_mass: 0.02,
  stated_volume: 0.05,
  user_memory: 0.1,
  household_measure: 0.25,
  serving_default: 0.3,
  model_estimate: 0.4,
  unknown: 0,
}

/** Elle girilen gramaj: tartılmadı, beyan edildi. */
export const USER_SET_TOLERANCE = 0.05

function interval(grams: number, tolerance: number): Interval {
  const clamped = Math.max(grams, 0)
  return {
    min: Math.round(clamped * (1 - tolerance) * 10) / 10,
    likely: Math.round(clamped * 10) / 10,
    max: Math.round(clamped * (1 + tolerance) * 10) / 10,
  }
}

function portion(
  rung: PortionRung,
  grams: number,
  tolerance: number,
  displayAmount: number,
  displayUnit: string,
): Portion {
  return { rung, grams: interval(grams, tolerance), tolerance, displayAmount, displayUnit }
}

const UNRESOLVED: Portion = {
  rung: 'unknown',
  grams: null,
  tolerance: 0,
  displayAmount: 0,
  displayUnit: 'g',
}

/** Sayılabilir birimler: yalnızca porsiyon tek bir parçayı temsil ediyorsa çarpılabilir. */
const COUNT_UNITS = new Set(['adet', 'dilim'])
/** Ev ölçüleri: gıdanın kendi porsiyon tanımı ölçünün karşılığıdır. */
const HOUSEHOLD_UNITS = new Set(['porsiyon', 'bardak', 'kasik', 'avuc', 'paket'])

export async function resolvePortion(
  item: ExtractedItem,
  ref: FoodRef,
  memory: Map<string, number>,
  phraseKey: string,
  estimator: PortionEstimator | null,
): Promise<Portion> {
  const { quantity, unit } = item
  const serving = ref.servingSize
  const servingUnit = ref.servingUnit === 'ml' ? 'ml' : 'g'

  // 1 — beyan edilmiş kütle: hesaplanacak bir şey yok
  if (unit === 'g' && quantity !== null && quantity > 0) {
    return portion('stated_mass', quantity, PORTION_TOLERANCE.stated_mass, Math.round(quantity), 'g')
  }

  // 2 — beyan edilmiş hacim. 1 ml ≈ 1 g kabul edilir; yağ/süt için sapma
  //     toleransın içinde kalır, bu yüzden bandı kütleden geniş tutuyoruz.
  if (unit === 'ml' && quantity !== null && quantity > 0) {
    return portion('stated_volume', quantity, PORTION_TOLERANCE.stated_volume, Math.round(quantity), 'ml')
  }

  // 3 — bu kişi bu ifadenin gramajını daha önce kendisi onayladı
  const remembered = memory.get(phraseKey)
  if (remembered && remembered > 0) {
    return portion('user_memory', remembered, PORTION_TOLERANCE.user_memory, Math.round(remembered), 'g')
  }

  // 4 — ev ölçüsü: gıdanın KENDİ porsiyon tanımı üzerinden
  if (unit && quantity !== null && quantity > 0 && serving && serving > 0) {
    const info = unitInfo(unit)
    const spread = info?.spread ?? PORTION_TOLERANCE.household_measure

    if (COUNT_UNITS.has(unit)) {
      // "10 badem" tuzağı: serving_size bir ölçüyü temsil ediyorsa (30 g badem)
      // adetle çarpmak 300 g verir. Sayılabilir değilse çarpma, alt basamağa düş.
      if (ref.isCountable) {
        const grams = quantity * serving
        return portion('household_measure', grams, spread, quantity, unit)
      }
    } else if (HOUSEHOLD_UNITS.has(unit)) {
      const grams = quantity * serving
      return portion('household_measure', grams, spread, quantity, unit)
    }
  }

  // 5 — birimsiz sayı
  if (unit === null && quantity !== null && quantity > 0) {
    // Büyük çıplak sayı gramdır: "150 pilav". Birim çıkarımı yapıldığı için
    // beyan edilmiş kütleden bir tık geniş bant.
    if (quantity > 10) {
      return portion('stated_mass', quantity, 0.05, Math.round(quantity), servingUnit)
    }
    // Küçük çıplak sayı adettir — yine yalnızca sayılabilir gıdada çarpılabilir.
    if (ref.isCountable && serving && serving > 0) {
      const grams = quantity * serving
      return portion('household_measure', grams, 0.15, quantity, 'adet')
    }
  }

  // 6 — miktar hiç belirtilmemiş: bir porsiyon varsay, bandı geniş tut
  if (quantity === null && serving && serving > 0) {
    return portion('serving_default', serving, PORTION_TOLERANCE.serving_default, 1, 'porsiyon')
  }

  // 7 — hiçbir kural cevaplayamadı → model YALNIZCA gram tahmin eder
  if (estimator) {
    const estimated = await estimator.estimate(item.phrase, ref.label, quantity, unit)
    if (estimated && estimated.likely > 0) {
      return {
        rung: 'model_estimate',
        grams: estimated,
        tolerance: PORTION_TOLERANCE.model_estimate,
        displayAmount: Math.round(estimated.likely),
        displayUnit: 'g',
      }
    }
  }

  return UNRESOLVED
}

/** Kullanıcının elle girdiği gramajı porsiyona çevirir (rung değil, düzeltmedir). */
export function userSetPortion(grams: number): Portion {
  return portion('user_memory', grams, USER_SET_TOLERANCE, Math.round(grams), 'g')
}
