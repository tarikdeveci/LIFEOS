// Hattın orkestrasyonu. Bu dosya çalışma zamanından bağımsızdır: ne Deno ne Node
// API'si kullanır, model adaptörlerini import ETMEZ — hepsi dışarıdan enjekte edilir.
// Eval de üretim de aynı fonksiyonu çağırır, tek fark enjekte edilen bağımlılıklar.

import { buildLexicalIndex } from './lexical.ts'
import { normalizePhrase } from './normalize.ts'
import { resolveItem, type ResolveContext } from './resolve.ts'
import { resolvePortion } from './portion.ts'
import { computeItem, isTraceable, sumTotals } from './compute.ts'
import { dispositionOf, scoreConfidence } from './confidence.ts'
import { questionFor } from './questions.ts'
import type {
  CuratedFood,
  ExtractedItem,
  ItemTrace,
  MealQuestion,
  ParseDeps,
  ParseMealResult,
  ParsedMealItem,
} from './types.ts'

export const PIPELINE_VERSION = 'nutrition-1.0.0'

/** Tek istekte işlenecek azami kalem — maliyet ve gecikme sınırı. */
const MAX_ITEMS = 30

function emptyResult(version: string): ParseMealResult {
  return {
    items: [],
    questions: [],
    ...sumTotals([]),
    matched_from_db: 0,
    estimated_by_ai: 0,
    version,
    trace: [],
  }
}

function gapReason(item: {
  rung: string
  hasCorpusCandidate: boolean
  portionUnknown: boolean
}): string | null {
  if (item.portionUnknown) return 'portion_unknown'
  if (item.rung === 'corpus_verified') return 'uncurated_food'
  if (item.rung === 'choices') return item.hasCorpusCandidate ? 'uncurated_food' : 'unresolved'
  if (item.rung === 'unresolved') return 'unresolved'
  return null
}

export async function parseMeal(input: string, deps: ParseDeps): Promise<ParseMealResult> {
  const version = `${PIPELINE_VERSION}/${deps.extractor.name}`
  if (!input || !input.trim()) return emptyResult(version)

  let extracted: ExtractedItem[] = await deps.extractor.extract(input)

  // Enjeksiyon işaretli parçalar tamamen elenir; "hiçbir şey yemedim" boş öğündür.
  if (extracted.some((item) => item.flags.includes('nothing_eaten'))) return emptyResult(version)
  extracted = extracted
    .filter((item) => !item.flags.includes('injection') && item.phrase.trim().length > 0)
    .slice(0, MAX_ITEMS)

  if (extracted.length === 0) return emptyResult(version)

  const [curated, aliases, memory] = await Promise.all([
    deps.repo.curated(),
    deps.repo.userAliases(),
    deps.repo.portionMemory(),
  ])

  const curatedById = new Map<string, CuratedFood>(curated.map((food) => [food.id, food]))
  const ctx: ResolveContext = {
    index: buildLexicalIndex(curated),
    curatedById,
    aliases,
    repo: deps.repo,
    verifier: deps.verifier,
  }

  const items: ParsedMealItem[] = []
  const questions: MealQuestion[] = []
  const trace: ItemTrace[] = []
  const gaps: { phrase: string; reason: string }[] = []

  let matchedFromDb = 0
  let touchedModel = 0

  for (const item of extracted) {
    const resolution = await resolveItem(item, ctx)
    const phraseKey = normalizePhrase(item.phrase)

    const portion = resolution.ref
      ? await resolvePortion(item, resolution.ref, memory, phraseKey, deps.portionEstimator)
      : { rung: 'unknown' as const, grams: null, tolerance: 0, displayAmount: 0, displayUnit: 'g' }

    trace.push({
      phrase: item.phrase,
      raw: item.raw,
      resolve_rung: resolution.rung,
      portion_rung: portion.rung,
      margin: Math.round(resolution.margin * 1000) / 1000,
      confidence: 0,
      candidates: resolution.candidates.slice(0, 4).map((c) => ({
        id: c.ref.id,
        label: c.ref.label,
        score: Math.round(c.score * 1000) / 1000,
      })),
    })

    const reason = gapReason({
      rung: resolution.rung,
      hasCorpusCandidate: resolution.candidates.some((c) => c.ref.kind === 'corpus'),
      portionUnknown: resolution.ref !== null && portion.grams === null,
    })
    if (reason) gaps.push({ phrase: item.phrase, reason })

    if (!isTraceable(resolution.ref, portion)) {
      const question = questionFor(item, resolution, portion)
      if (question) questions.push(question)
      continue
    }

    const confidence = scoreConfidence(item.confidence, resolution, portion)
    const computed = computeItem(item, resolution, portion, confidence, dispositionOf(confidence))
    items.push(computed)
    trace[trace.length - 1]!.confidence = computed.confidence

    if (resolution.rung === 'lexical_verified' || resolution.rung === 'corpus_verified') touchedModel++
    else if (portion.rung === 'model_estimate') touchedModel++
    else matchedFromDb++
  }

  if (gaps.length > 0) {
    // Kuyruk yazımı sonucu etkilemez; hata olursa çözümleme bozulmamalı.
    try {
      await deps.repo.recordGaps(gaps)
    } catch (error) {
      console.error('food_gaps yazılamadı:', error)
    }
  }

  return {
    items,
    questions,
    ...sumTotals(items),
    matched_from_db: matchedFromDb,
    estimated_by_ai: touchedModel,
    version,
    trace,
  }
}

export * from './types.ts'
export { AUTO_THRESHOLD } from './confidence.ts'
export { CORPUS_CONFIDENCE_CAP } from './resolve.ts'
export { PORTION_TOLERANCE, USER_SET_TOLERANCE } from './portion.ts'
export { createRulesExtractor, extractWithRules } from './rules.ts'
export { normalizePhrase, parseQuantity, splitInput } from './normalize.ts'
