/**
 * Elle yiyecek aramasının sıralama katmanı.
 *
 * Neden ayrı bir dosya: arama bugüne kadar sıralamasızdı. Üç ayrı `ilike`
 * sorgusunun sonuçları sorgu sırasına göre arka arkaya ekleniyordu, yani
 * "alaka" diye bir kavram yoktu. Ölçülen sonuç (6 Eylül, canlı veritabanı):
 *
 *   "bal" →  1. Balık (levrek, ızgara)
 *            2. Ton balığı (konserve)
 *            3. Dardanel ton balığı
 *            4. Bal (1 kaşık)
 *            5. Bal                     ← aranan şey burada
 *            7. Çiğ köfte (1 porsiyon)  ← name_en: "...bulgur BALls"
 *            8. Köfte (ızgara)          ← name_en: "meatBALls"
 *
 * İki ayrı kusur var ve ikisi de burada çözülüyor:
 *
 * 1. KELİME ORTASI EŞLEŞMESİ. `%bal%` İngilizce "meatballs" kelimesinin
 *    ortasına düşüyor. Türkçe bir sorgunun İngilizce bir kelimenin içine
 *    rastlaması kanıt değil, tesadüf. Yabancı alanda (name_en, USDA korpusu)
 *    kelime ortası eşleşmesi TAMAMEN atılıyor; Türkçe alanda zayıf ama geçerli
 *    sayılıyor, çünkü "çiğköfte" bitişik yazılmış olabilir.
 *
 * 2. SIRALAMA YOK. Tam eşleşme ("Bal") ile önek eşleşmesi ("Balık") arasında
 *    fark gözetilmiyordu. Artık gözetiliyor.
 *
 * Skor yalnızca SIRALAMADIR. Besin değeri hâlâ seçilen satırdan hesaplanıyor
 * (`buildItemFromChoice`); bu dosya hangi satırların gösterileceğine karar
 * verir, o satırın kaç kalori olduğuna değil.
 */

import { normalizeFoodPhrase } from './nutrition'

/** Bu skorun altındaki aday hiç gösterilmez. */
export const FOOD_SEARCH_FLOOR = 0.3

/** Yabancı alanda önek eşleşmesi için sorgunun en az bu kadar harfi olmalı. */
const FOREIGN_PREFIX_MIN = 5

/** Yüzey ağırlıkları: eşleşmenin hangi alanda olduğu kanıt gücünü değiştirir. */
const WEIGHT_NAME = 1
const WEIGHT_ALIAS = 0.95
const WEIGHT_NAME_EN = 0.62

/** Küratörlü satırlar elle kontrol edilmiş; eşitlikte korpusun önünde olmalı. */
const CORPUS_FACTOR = 0.85

/**
 * Korpus setleri arasında tercih sırası. `off` (Open Food Facts) marka
 * ürünleri; insanların yediği yemek değil, raftaki paket. En sona.
 *
 * NOT: eski kod `ORDER BY dataset ASC` yapıyordu ve yorumunda "önce survey"
 * yazıyordu — alfabetik sırada `off` < `survey` olduğu için tam tersini
 * yapıyordu. Tercih artık alfabeye değil bu tabloya bakıyor.
 */
const DATASET_BONUS: Record<string, number> = {
  survey: 0.06,
  foundation: 0.04,
  sr_legacy: 0.02,
  // Marka ürünü genel bir sorgunun cevabı değil: "bal" arayan kişi bal istiyor,
  // ballı hardallı mısır cipsi değil. Elenmiyor, sadece geriye alınıyor.
  off: -0.05,
}

export interface RankableFood {
  name: string
  name_en?: string | null
  aliases?: string[] | null
}

/**
 * Tek bir yüzeyi (ad, alias, İngilizce ad, korpus açıklaması) sorguyla
 * karşılaştırır. 0 dönmesi "eşleşme yok" demektir, zayıf eşleşme değil.
 *
 * @param foreign Yüzey yabancı dilse (İngilizce ad, USDA korpusu) kelime
 *   ortası eşleşmesi ve kısa önek eşleşmesi kabul edilmez.
 */
export function scoreSurface(
  query: string,
  queryWords: string[],
  surface: string,
  foreign: boolean,
): number {
  const s = normalizeFoodPhrase(surface)
  if (!s || !query) return 0
  if (s === query) return 1

  const words = s.split(' ')
  // Baş kelimede eşleşme daha güçlü kanıt: "Balık (levrek)" ile "Ton balığı"
  // aynı önek eşleşmesini verir ama "bal" arayan büyük ihtimalle ilkini kastediyor.
  const head = (matched: boolean, score: number) => (matched ? score + 0.03 : score)

  if (words.includes(query)) return head(words[0] === query, 0.9)
  if (queryWords.length > 1 && queryWords.every((w) => words.includes(w))) return 0.82

  const prefixAllowed = !foreign || query.length >= FOREIGN_PREFIX_MIN
  if (prefixAllowed && query.length >= 3) {
    if (words.some((w) => w.startsWith(query))) return head(words[0]?.startsWith(query) ?? false, 0.7)
    if (queryWords.length > 1 && queryWords.every((qw) => words.some((w) => w.startsWith(qw)))) {
      return 0.62
    }
  }

  // Buraya düşen tek ihtimal: sorgu bir kelimenin ORTASINDA geçiyor.
  // Türkçe alanda bu "çiğköfte" gibi bitişik yazımı kurtarır; yabancı alanda
  // yalnızca "bal" → "meatballs" üretir.
  if (!foreign && s.includes(query)) return 0.45
  return 0
}

/** Küratörlü (`food_items`) bir satırın sorguya uygunluğu. */
export function scoreCuratedFood(query: string, food: RankableFood, verified = false): number {
  const q = normalizeFoodPhrase(query)
  if (!q) return 0
  const qWords = q.split(' ')

  let best = WEIGHT_NAME * scoreSurface(q, qWords, food.name, false)

  for (const alias of food.aliases ?? []) {
    best = Math.max(best, WEIGHT_ALIAS * scoreSurface(q, qWords, alias, false))
  }
  if (food.name_en) {
    best = Math.max(best, WEIGHT_NAME_EN * scoreSurface(q, qWords, food.name_en, true))
  }

  return best > 0 && verified ? best + 0.02 : best
}

/**
 * Korpus satırının uygunluğu.
 *
 * `off` seti Türkiye'den marka ürünleri, açıklamaları Türkçe; USDA setleri
 * İngilizce. Kelime ortası kuralı bu yüzden sete göre değişiyor — hepsini
 * yabancı saymak "Ballı Fıstık Ezmesi"ni de atardı.
 */
export function scoreCorpusFood(query: string, description: string, dataset?: string): number {
  const q = normalizeFoodPhrase(query)
  if (!q) return 0

  const foreign = dataset !== 'off'
  const base = scoreSurface(q, q.split(' '), description, foreign)
  if (base <= 0) return 0

  return base * CORPUS_FACTOR + (DATASET_BONUS[dataset ?? ''] ?? 0)
}

/**
 * Skorlanmış adayları sıralar ve eşiğin altındakileri atar.
 *
 * Eşitlikte kısa etiket önde: "Bal" ile "Bal & Hardal Aromalı Mısır Cipsi"
 * aynı skoru alırsa kullanıcının kastettiği neredeyse her zaman kısa olandır.
 */
export function rankFoodMatches<T>(
  scored: Array<{ item: T; score: number; label: string }>,
  limit: number,
): T[] {
  return scored
    .filter((entry) => entry.score >= FOOD_SEARCH_FLOOR)
    .sort((a, b) => b.score - a.score || a.label.length - b.label.length)
    .slice(0, limit)
    .map((entry) => entry.item)
}
