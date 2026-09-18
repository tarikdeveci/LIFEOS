// Kimlik merdiveni: "bu kelime hangi veritabanı satırı?"
//
// Basamaklar ucuzdan pahalıya sıralı ve ilk kesin cevapta durulur. Bir öğünün
// büyük çoğunluğu ilk üç basamakta biter; model yalnızca gerçekten çekişmeli
// durumlarda devreye girer ve o zaman bile KAPALI bir listeden seçim yapar —
// yeni bir kimlik uyduramaz.
//
// Doğrulayıcıya ulaşılamıyorsa basamak kapalı biter: kalem kullanıcıya sorulur,
// model erişilemediği için onaylayıcıya dönüşmez.

import { bridgeToEnglish, normalizePhrase } from './normalize.ts'
import {
  MIN_MARGIN,
  PLAUSIBLE_SCORE,
  SELF_EVIDENT_SCORE,
  exactAliasMatch,
  marginOf,
  scoreCorpus,
  scoreCurated,
  type LexicalIndex,
} from './lexical.ts'
import { corpusRef, curatedRef } from './refs.ts'
import type {
  AliasTarget,
  Candidate,
  CuratedFood,
  EstimatedFood,
  ExtractedItem,
  FoodEstimator,
  FoodRef,
  FoodRepo,
  Resolution,
  Verifier,
} from './types.ts'

/** Küratörsüz korpus satırlarının güven tavanı — asla otomatik loglanamaz. */
export const CORPUS_CONFIDENCE_CAP = 0.6

/**
 * Model tahminli satırların güven tavanı. AUTO_THRESHOLD'un (0.75) altında
 * OLMASI şart: tahmin hiçbir koşulda kullanıcıya sorulmadan öğüne yazılmamalı.
 */
export const ESTIMATE_CONFIDENCE_CAP = 0.55

export interface ResolveContext {
  index: LexicalIndex
  curatedById: Map<string, CuratedFood>
  aliases: Map<string, AliasTarget>
  repo: FoodRepo
  verifier: Verifier | null
  estimator: FoodEstimator | null
}

function unresolved(candidates: Candidate[] = []): Resolution {
  return { rung: 'unresolved', ref: null, confidence: 0, margin: marginOf(candidates), candidates }
}

async function fromAlias(target: AliasTarget, ctx: ResolveContext): Promise<Resolution | null> {
  if (target.food_item_id) {
    const food = ctx.curatedById.get(target.food_item_id)
    if (!food) return null
    return {
      rung: 'user_alias',
      ref: curatedRef(food),
      confidence: 0.98,
      margin: 1,
      candidates: [],
    }
  }
  if (target.corpus_fdc_id) {
    const rows = await ctx.repo.corpusByIds([target.corpus_fdc_id])
    const row = rows[0]
    if (!row) return null
    return {
      rung: 'user_alias',
      // Kullanıcının kendisi onayladı: korpus tavanı burada geçerli değil.
      ref: corpusRef(row),
      confidence: 0.95,
      margin: 1,
      candidates: [],
    }
  }
  return null
}

/**
 * Kullanıcı alias'ı yalnızca iki yoldan doğar: listeden bir satır seçmek (ifade
 * o satırın KENDİ adıdır) ya da belirsiz kalem sorusunda aday seçmek. Soru ancak
 * birebir küratörlü eşleşme yokken sorulur. Hedef satır ifadeyi kendi adı olarak
 * taşımıyorsa ve ifade artık başka bir satırla birebir eşleşiyorsa, alias katalog
 * o yemeği tanımadan önce eldeki en yakın satırdan seçilmiş demektir.
 *
 * Ölçülen hata (14 Eylül): "etli yeşil fasulye" kuru fasulye değerine
 * ezberlenmişti; katalog büyüse de ifade her seferinde oraya gidiyordu.
 *
 * Hedefin kendi adı ifadeyle aynıysa alias bilinçli bir seçimdir ve korunur:
 * kullanıcının "Menemen" adlı kişisel tarifi, global "Menemen" satırına ezilmez.
 */
function isStaleAlias(
  target: AliasTarget,
  exact: FoodRef | null,
  phrase: string,
  ctx: ResolveContext,
): boolean {
  if (!exact || !target.food_item_id || target.food_item_id === exact.id) return false
  const food = ctx.curatedById.get(target.food_item_id)
  if (!food) return false
  const ownSurfaces = [food.name, food.name_en, ...(food.aliases ?? [])]
  return !ownSurfaces.some((surface) => surface && normalizePhrase(surface) === phrase)
}

async function searchCorpusCandidates(phrase: string, repo: FoodRepo): Promise<Candidate[]> {
  const normalized = normalizePhrase(phrase)
  const bridged = bridgeToEnglish(phrase)

  const queries = bridged && bridged !== normalized ? [bridged, normalized] : [normalized]
  const seen = new Map<string, Candidate>()

  for (const query of queries) {
    if (query.length < 3) continue
    const rows = await repo.searchCorpus(query, 25)
    for (const candidate of scoreCorpus(rows, query, 8)) {
      const existing = seen.get(candidate.ref.id)
      if (!existing || candidate.score > existing.score) seen.set(candidate.ref.id, candidate)
    }
  }

  return [...seen.values()].sort((a, b) => b.score - a.score).slice(0, 6)
}

/**
 * Vektör araması. Trigram'ın yapısal olarak göremediği şeyi görür: "pişi" ile
 * "fried dough" arasında ortak harf üçlüsü yok, ortak ANLAM var.
 *
 * Gömme katmanı kurulu değilse (embedding sütunları boş, OPENAI_API_KEY yok)
 * repo boş dizi döndürür ve basamak sessizce atlanır — hattın geri kalanı
 * bu katmana bağımlı değil.
 */
async function searchSemanticCandidates(phrase: string, repo: FoodRepo): Promise<Candidate[]> {
  let matches
  try {
    matches = await repo.searchSemantic(phrase, 8)
  } catch (error) {
    // Arama katmanının çökmesi öğünü çökertmemeli: bir aday kaynağı eksilir.
    console.error('semantik arama başarısız:', error)
    return []
  }

  return matches.map((match) =>
    match.kind === 'curated'
      ? { ref: curatedRef(match.food), score: match.similarity }
      : { ref: corpusRef(match.food), score: match.similarity }
  )
}

/** Aynı satırı iki kaynak da bulduysa tek kalem, yüksek skor geçerli. */
function mergeCandidates(...groups: Candidate[][]): Candidate[] {
  const best = new Map<string, Candidate>()
  for (const group of groups) {
    for (const candidate of group) {
      const existing = best.get(candidate.ref.id)
      if (!existing || candidate.score > existing.score) best.set(candidate.ref.id, candidate)
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, 8)
}

/**
 * Tahminin fizikle tutarlı olup olmadığı. Modelin bu sistemde yazabildiği tek
 * sayı grubu bu, ve tek başına bırakılamaz: 4/4/9 aritmetiği kalorinin
 * makrolarla uyumunu bağımsız olarak kontrol eder. Tutmuyorsa tahmin
 * REDDEDİLİR — düzeltilmez. Düzeltmek, yanlış bir sayıyı makul görünen başka
 * bir yanlış sayıya çevirir ve hatayı teşhis edilemez kılar.
 */
export function isPlausibleEstimate(estimate: EstimatedFood): boolean {
  const { kcal, protein, carbs, fat, fiber } = estimate.per100g
  const values = [kcal, protein, carbs, fat, fiber]
  if (values.some((v) => !Number.isFinite(v) || v < 0)) return false

  // Saf yağ 884 kcal/100 g. Hiçbir yiyecek bunu anlamlı biçimde geçemez.
  if (kcal > 900) return false
  // Katı madde toplamı 100 g'ı aşamaz (su ve kül geri kalanı).
  if (protein + carbs + fat > 100) return false

  // Atwater: kcal ≈ 4P + 4C + 9F. Lif karbonhidratın içinde sayıldığı ve
  // pişmiş yemeklerde bileşim dalgalandığı için bant geniş tutuldu.
  const atwater = 4 * protein + 4 * carbs + 9 * fat
  const tolerance = Math.max(60, atwater * 0.35)
  return Math.abs(kcal - atwater) <= tolerance
}

export async function resolveItem(
  item: ExtractedItem,
  ctx: ResolveContext,
): Promise<Resolution> {
  const phrase = normalizePhrase(item.phrase)
  if (!phrase) return unresolved()

  const exact = exactAliasMatch(ctx.index, phrase)

  // 1 — kullanıcının kendi düzeltmesi
  const aliasTarget = ctx.aliases.get(phrase)
  if (aliasTarget && !isStaleAlias(aliasTarget, exact, phrase, ctx)) {
    const resolved = await fromAlias(aliasTarget, ctx)
    if (resolved) return resolved
  }

  // 2 — küratörlü satırın kendi adı/alias'ıyla birebir eşleşme
  if (exact) {
    return { rung: 'global_alias', ref: exact, confidence: 0.9, margin: 1, candidates: [] }
  }

  // 3 — sözlüksel: hem yüksek hem açık ara
  const curated = scoreCurated(ctx.index, phrase)
  const margin = marginOf(curated)
  const top = curated[0]

  if (top && top.score >= SELF_EVIDENT_SCORE && margin >= MIN_MARGIN) {
    return {
      rung: 'lexical',
      ref: top.ref,
      confidence: Math.min(0.95, top.score),
      margin,
      candidates: curated,
    }
  }

  // 4 — makul ama bariz değil → tek soruluk model doğrulaması
  if (top && top.score >= PLAUSIBLE_SCORE && ctx.verifier) {
    const chosenId = await ctx.verifier.verify(item.phrase, curated)
    const chosen = curated.find((c) => c.ref.id === chosenId)
    if (chosen) {
      return {
        rung: 'lexical_verified',
        ref: chosen.ref,
        confidence: Math.min(0.85, Math.max(chosen.score, 0.7)),
        margin,
        candidates: curated,
      }
    }
    // Doğrulayıcı "hiçbiri" dedi — küratörlü katman bu yiyeceği tanımıyor demektir.
  }

  // 5/6 — geniş aday havuzu. İki bağımsız kaynak birleştiriliyor: trigram
  //       (yazım benzerliği) ve vektör (anlam benzerliği). İkisi farklı hataları
  //       yapar — trigram "pişi"yi hiç göremez, vektör "Pınar"ı "pınar suyu"ndan
  //       ayıramaz — ve birbirlerinin kör noktasını kapatırlar.
  //
  //       Havuzun büyümesi kabul eşiğini GEVŞETMEZ: skor hâlâ yalnızca sıralama,
  //       kabul hâlâ doğrulayıcının işi.
  const trigram = await searchCorpusCandidates(item.phrase, ctx.repo)
  const semantic = await searchSemanticCandidates(item.phrase, ctx.repo)
  const trigramIds = new Set(trigram.map((c) => c.ref.id))
  const pool = mergeCandidates(trigram, semantic)

  if (pool.length > 0 && ctx.verifier) {
    const chosenId = await ctx.verifier.verify(item.phrase, pool)
    const chosen = pool.find((c) => c.ref.id === chosenId)
    if (chosen) {
      // Küratörlü satır korpus tavanına tabi değil: onu bir insan okudu.
      const cap = chosen.ref.kind === 'curated' ? 0.85 : CORPUS_CONFIDENCE_CAP
      return {
        rung: trigramIds.has(chosen.ref.id) ? 'corpus_verified' : 'semantic_verified',
        ref: chosen.ref,
        confidence: Math.min(cap, Math.max(chosen.score, 0.4)),
        margin: marginOf(pool),
        candidates: pool,
      }
    }
    // Doğrulayıcı "hiçbiri" dedi. Bu zayıf bir sinyal değil: kapalı listeyi
    // gördü ve reddetti, yani yiyecek gerçekten sözlükte yok.
  }

  const plausible = curated.filter((c) => c.score >= PLAUSIBLE_SCORE).slice(0, 4)

  // 7 — tahmin basamağı. Yalnızca hiçbir katman bu yiyeceği TANIMADIĞINDA.
  //     Makul bir küratörlü aday dururken tahmin üretmek, cevabı zaten
  //     bilinen soruyu uydurmak olurdu; o yüzden plausible boş olmalı.
  //
  //     Üretilen şey bir öğün kalemi değil, kişisel sözlüğe yazılan bir SATIR.
  //     Kalori yine o satırdan hesaplanır, güven tavanı otomatik kabul eşiğinin
  //     altındadır: kullanıcı onaylamadan öğüne yazılmaz.
  if (ctx.estimator && plausible.length === 0 && phrase.length >= 3) {
    const estimated = await estimateFood(item, ctx)
    if (estimated) return estimated
  }

  if (pool.length > 0) {
    return {
      rung: 'choices',
      ref: null,
      confidence: 0,
      margin: marginOf(pool),
      candidates: [...plausible.slice(0, 2), ...pool].slice(0, 5),
    }
  }

  if (plausible.length > 0) {
    return { rung: 'choices', ref: null, confidence: 0, margin, candidates: plausible }
  }

  return unresolved(curated.slice(0, 3))
}

/**
 * Modelden referans değer isteyip kişisel sözlüğe yazar.
 *
 * Üç kapıdan geçmeden satır olamaz: model emin olmalı (null dönebilir),
 * değerler fizikle tutarlı olmalı (isPlausibleEstimate), ve yazma başarılı
 * olmalı. Herhangi biri düşerse null döner ve kalem soruya dönüşür —
 * "yaklaşık bir şey yazalım" yolu bilerek yok.
 */
async function estimateFood(item: ExtractedItem, ctx: ResolveContext): Promise<Resolution | null> {
  if (!ctx.estimator) return null

  let estimate: EstimatedFood | null
  try {
    estimate = await ctx.estimator.estimate(item.phrase, item.preparation)
  } catch (error) {
    console.error('yiyecek tahmini başarısız:', error)
    return null
  }
  if (!estimate || !isPlausibleEstimate(estimate)) return null

  const saved = await ctx.repo.saveEstimatedFood(estimate)
  if (!saved) return null

  // Aynı istekteki sonraki kalemler de bu satırı görebilsin.
  ctx.curatedById.set(saved.id, saved)

  return {
    rung: 'ai_estimate',
    ref: curatedRef(saved),
    confidence: Math.min(ESTIMATE_CONFIDENCE_CAP, Math.max(estimate.confidence, 0.3)),
    margin: 1,
    candidates: [],
  }
}
