// Sözlüksel eşleştirme: IDF ağırlıklı token örtüşmesi + trigram Dice.
//
// Model tarafına göre iki mertebe daha ucuz olduğu için merdivenin en çok
// kullanılan basamağı burası. Skorun kendisi kadar önemli olan şey **marj**:
// tepe skorun yüksek olması yeterli değil, ikinci adayla arasında açık fark
// olmalı. Fark yoksa iki yiyecek eşit derecede olası demektir — model doğrulaması
// tam olarak o durumda değerlidir.

import { normalizePhrase, tokenize } from './normalize.ts'
import { curatedRef, corpusRef } from './refs.ts'
import type { Candidate, CorpusFood, CuratedFood, FoodRef } from './types.ts'

/** Bir adayın kendiliğinden kabul edilebilmesi için gereken mutlak skor. */
export const SELF_EVIDENT_SCORE = 0.72
/** Kendiliğinden kabul için gereken, ikinci adaya olan asgari fark. */
export const MIN_MARGIN = 0.12
/** Bu skorun altındaki adaylar doğrulayıcıya bile götürülmez. */
export const PLAUSIBLE_SCORE = 0.42

interface Surface {
  tokens: string[]
  text: string
  /** alias'lar isim kadar güvenilir değil: küratör onları eşanlamlı diye yazdı */
  weight: number
}

interface IndexedFood {
  food: CuratedFood
  surfaces: Surface[]
}

export interface LexicalIndex {
  foods: IndexedFood[]
  idf: Map<string, number>
  /** Birebir yüzey metni → yiyecek. Çakışmada ağırlık, eşitlikte id kazanır. */
  bySurface: Map<string, CuratedFood>
}

function trigrams(text: string): Set<string> {
  const padded = `  ${text} `
  const out = new Set<string>()
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3))
  return out
}

function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const gram of a) if (b.has(gram)) shared++
  return (2 * shared) / (a.size + b.size)
}

export function buildLexicalIndex(foods: CuratedFood[]): LexicalIndex {
  const bySurface = new Map<string, CuratedFood>()
  const surfaceWeight = new Map<string, number>()

  const indexed: IndexedFood[] = foods.map((food) => {
    const surfaces: Surface[] = []
    const push = (text: string | null, weight: number) => {
      if (!text) return
      const normalized = normalizePhrase(text)
      if (!normalized) return
      surfaces.push({ text: normalized, tokens: tokenize(normalized), weight })

      // Aynı yüzeyi birden çok satır iddia edebiliyor (küratörlü katmanda 255
      // satıra karşılık 58 çakışan yüzey var: "tereyagi" hem Tereyağı (1 yk)
      // hem Tereyağı, "fasulye" hem Kuru fasulye hem Fasulye (haşlanmış)).
      //
      // Eskiden "ilk yazan kazanır"dı ve o sıra food_items sorgusunun DÖNÜŞ
      // SIRASIYDI — sorguda ORDER BY yok, yani fiziksel satır sırası. Bir UPDATE
      // ya da VACUUM sonrası aynı girdi başka bir yiyeceğe oturabilirdi; aynı
      // metin bugün 14 g tereyağı, yarın 100 g.
      //
      // İki kurallı ve deterministik: önce ağırlık (ifade bir satırın ADIYSA,
      // başkasının alias'ı olmasını yener), eşitlikte id. İkisi de satır
      // sırasından bağımsız.
      const best = surfaceWeight.get(normalized)
      const winner = bySurface.get(normalized)
      if (
        best === undefined ||
        weight > best ||
        (weight === best && winner !== undefined && food.id < winner.id)
      ) {
        bySurface.set(normalized, food)
        surfaceWeight.set(normalized, weight)
      }
    }
    push(food.name, 1)
    push(food.name_en, 0.95)
    for (const alias of food.aliases ?? []) push(alias, 0.9)
    return { food, surfaces }
  })

  // df: bir token kaç farklı yiyecekte geçiyor. "peyniri" her yerde geçiyorsa
  // ayırt edici değildir; "labne" bir yerde geçiyorsa çok değerlidir.
  const df = new Map<string, number>()
  for (const entry of indexed) {
    const seen = new Set<string>()
    for (const surface of entry.surfaces) for (const token of surface.tokens) seen.add(token)
    for (const token of seen) df.set(token, (df.get(token) ?? 0) + 1)
  }

  const total = Math.max(indexed.length, 1)
  const idf = new Map<string, number>()
  for (const [token, count] of df) idf.set(token, Math.log(1 + total / count))

  return { foods: indexed, idf, bySurface }
}

function idfOf(idf: Map<string, number>, token: string): number {
  return idf.get(token) ?? Math.log(1 + 50)
}

function weightedCoverage(
  source: string[],
  target: Set<string>,
  idf: Map<string, number>,
): number {
  if (source.length === 0) return 0
  let matched = 0
  let total = 0
  for (const token of source) {
    const weight = idfOf(idf, token)
    total += weight
    if (target.has(token)) matched += weight
  }
  return total > 0 ? matched / total : 0
}

function scoreSurface(
  phraseTokens: string[],
  phraseTrigrams: Set<string>,
  phraseText: string,
  surface: Surface,
  idf: Map<string, number>,
): number {
  const surfaceSet = new Set(surface.tokens)
  const phraseSet = new Set(phraseTokens)

  // Yüzey ifadenin ne kadarı girdide var + girdinin ne kadarı yüzeyde var.
  // İkisi birden gerekli: yalnız ilki "tavuk" ile "tavuk göğsü suyu"nu eşitler,
  // yalnız ikincisi kısa alias'ları haksız yere ödüllendirir.
  const surfaceCoverage = weightedCoverage(surface.tokens, phraseSet, idf)
  const phraseCoverage = weightedCoverage(phraseTokens, surfaceSet, idf)
  const tokenScore = 0.6 * surfaceCoverage + 0.4 * phraseCoverage

  const diceScore = dice(phraseTrigrams, trigrams(surface.text))

  // Tam eşleşme her zaman kazanmalı
  if (surface.text === phraseText) return surface.weight

  return surface.weight * (0.65 * tokenScore + 0.35 * diceScore)
}

/** Küratörlü katmanda adayları skorlar. Sonuç azalan sırada. */
export function scoreCurated(index: LexicalIndex, phrase: string, limit = 6): Candidate[] {
  const phraseText = normalizePhrase(phrase)
  if (!phraseText) return []
  const phraseTokens = tokenize(phraseText)
  const phraseTrigrams = trigrams(phraseText)

  const scored: Candidate[] = []
  for (const entry of index.foods) {
    let best = 0
    for (const surface of entry.surfaces) {
      const score = scoreSurface(phraseTokens, phraseTrigrams, phraseText, surface, index.idf)
      if (score > best) best = score
    }
    if (best > 0.05) scored.push({ ref: curatedRef(entry.food), score: best })
  }

  scored.sort((a, b) => b.score - a.score || a.ref.label.length - b.ref.label.length)
  return scored.slice(0, limit)
}

/**
 * Korpus adaylarını skorlar. Burada IDF yok — satırlar gevşek yazılmış USDA
 * açıklamaları ve bu katmanın güvenliği skordan değil doğrulayıcıdan gelir.
 * Skor sadece sıralama içindir.
 */
export function scoreCorpus(rows: CorpusFood[], query: string, limit = 6): Candidate[] {
  const queryText = normalizePhrase(query)
  const queryTokens = new Set(tokenize(queryText))
  const queryTrigrams = trigrams(queryText)

  const scored: Candidate[] = rows.map((row) => {
    const text = normalizePhrase(row.search_text || row.description)
    const tokens = tokenize(text)
    const covered = tokens.length > 0
      ? tokens.filter((t) => queryTokens.has(t)).length / tokens.length
      : 0
    const queryCovered = queryTokens.size > 0
      ? [...queryTokens].filter((t) => tokens.includes(t)).length / queryTokens.size
      : 0
    const diceScore = dice(queryTrigrams, trigrams(text))
    const sqlScore = Number.isFinite(row.score) ? Number(row.score) : 0

    const score = 0.35 * queryCovered + 0.2 * covered + 0.25 * diceScore + 0.2 * sqlScore
    return { ref: corpusRef(row), score }
  })

  scored.sort((a, b) => b.score - a.score || a.ref.label.length - b.ref.label.length)
  return scored.slice(0, limit)
}

/** Tepe aday ile ikincisi arasındaki fark. Tek aday varsa fark tepe skorun kendisidir. */
export function marginOf(candidates: Candidate[]): number {
  if (candidates.length === 0) return 0
  if (candidates.length === 1) return candidates[0]!.score
  return candidates[0]!.score - candidates[1]!.score
}

/** Bir ifadenin küratörlü bir satırın alias'ıyla birebir eşleşip eşleşmediği. */
export function exactAliasMatch(index: LexicalIndex, phrase: string): FoodRef | null {
  const target = normalizePhrase(phrase)
  if (!target) return null
  const food = index.bySurface.get(target)
  return food ? curatedRef(food) : null
}

/**
 * "yumurta beyaz peynir" → ["yumurta", "beyaz peynir"]
 *
 * Ne ayırıcı ne miktar içeren girdide bölmenin tek dayanağı sözlüktür. Kural
 * katmanı böyle bir ifadeyi tek kaleme düşürüyor, sözlüksel skor da onu en
 * benzeyen TEK satıra oturtuyordu: ikinci yiyecek soru bile sorulmadan
 * kayboluyor, kalori eksik çıkıyordu.
 *
 * Kabul ölçütü bilerek katı: her parça bir alias'la BİREBİR eşleşmeli ve
 * parçalar ifadenin tamamını kaplamalı. Tek bir sözcük artarsa bölme yapılmaz —
 * yanlış bölmek, bölmemekten pahalıdır. En uzun eşleşme önce denendiği için
 * "tavuk göğsü" tek parça kalır, "tavuk" + "göğsü" diye ayrılmaz.
 */
export function segmentByLexicon(index: LexicalIndex, phrase: string): string[] {
  const text = normalizePhrase(phrase)
  if (!text) return []

  // İfadenin kendisi bir yüzeyse bütün hâli her zaman kazanır.
  if (index.bySurface.has(text)) return []

  const words = text.split(' ').filter(Boolean)
  if (words.length < 2) return []

  const segments: string[] = []
  let cursor = 0
  while (cursor < words.length) {
    let length = 0
    for (let end = words.length; end > cursor; end--) {
      if (index.bySurface.has(words.slice(cursor, end).join(' '))) {
        length = end - cursor
        break
      }
    }
    if (length === 0) return []
    segments.push(words.slice(cursor, cursor + length).join(' '))
    cursor += length
  }

  return segments.length >= 2 ? segments : []
}
