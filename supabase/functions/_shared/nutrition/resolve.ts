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
  ExtractedItem,
  FoodRepo,
  Resolution,
  Verifier,
} from './types.ts'

/** Küratörsüz korpus satırlarının güven tavanı — asla otomatik loglanamaz. */
export const CORPUS_CONFIDENCE_CAP = 0.6

export interface ResolveContext {
  index: LexicalIndex
  curatedById: Map<string, CuratedFood>
  aliases: Map<string, AliasTarget>
  repo: FoodRepo
  verifier: Verifier | null
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

export async function resolveItem(
  item: ExtractedItem,
  ctx: ResolveContext,
): Promise<Resolution> {
  const phrase = normalizePhrase(item.phrase)
  if (!phrase) return unresolved()

  // 1 — kullanıcının kendi düzeltmesi
  const aliasTarget = ctx.aliases.get(phrase)
  if (aliasTarget) {
    const resolved = await fromAlias(aliasTarget, ctx)
    if (resolved) return resolved
  }

  // 2 — küratörlü satırın kendi adı/alias'ıyla birebir eşleşme
  const exact = exactAliasMatch(ctx.index, phrase)
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

  // 5/6 — korpus katmanı. Skor tek başına kabul sebebi değil.
  const corpus = await searchCorpusCandidates(item.phrase, ctx.repo)
  if (corpus.length > 0) {
    if (ctx.verifier) {
      const chosenId = await ctx.verifier.verify(item.phrase, corpus)
      const chosen = corpus.find((c) => c.ref.id === chosenId)
      if (chosen) {
        return {
          rung: 'corpus_verified',
          ref: chosen.ref,
          confidence: Math.min(CORPUS_CONFIDENCE_CAP, Math.max(chosen.score, 0.4)),
          margin: marginOf(corpus),
          candidates: corpus,
        }
      }
    }

    // Doğrulayıcı yok (ya da reddetti): kısa listeyi soru olarak döndür, kabul etme.
    return {
      rung: 'choices',
      ref: null,
      confidence: 0,
      margin: marginOf(corpus),
      candidates: [...curated.filter((c) => c.score >= PLAUSIBLE_SCORE).slice(0, 2), ...corpus].slice(0, 5),
    }
  }

  // Korpus da boş: küratörlü katmanda makul aday varsa onları sor.
  const plausible = curated.filter((c) => c.score >= PLAUSIBLE_SCORE).slice(0, 4)
  if (plausible.length > 0) {
    return { rung: 'choices', ref: null, confidence: 0, margin, candidates: plausible }
  }

  return unresolved(curated.slice(0, 3))
}
