// Neyin sorulacağı — ve neyin sorulmaya değmediği.
//
// Her soru kullanıcıyı böler, o yüzden yalnızca cevabı sonucu değiştirecek şeyler
// sorulur. Kimlik belirsizse kapalı bir liste sunulur (serbest metin değil: liste
// dışı cevap yine çözümlenemez bir ifade üretir). Miktar belirsizse gramaj sorulur.

import type {
  ExtractedItem,
  MealQuestion,
  Portion,
  QuestionChoice,
  Resolution,
} from './types.ts'

function toChoices(resolution: Resolution): QuestionChoice[] {
  return resolution.candidates.slice(0, 5).map((candidate) => ({
    id: candidate.ref.id,
    source: candidate.ref.kind,
    label: candidate.ref.label,
    kcal_per_100g: Math.round(candidate.ref.per100g.kcal),
  }))
}

/** Kalem sonuç listesine giremediyse hangi soruya dönüşeceğini üretir. */
export function questionFor(
  item: ExtractedItem,
  resolution: Resolution,
  portion: Portion,
): MealQuestion | null {
  // Kimlik çözülemedi → kapalı liste (boş olabilir: o zaman "bu yiyeceği tanımıyoruz")
  if (!resolution.ref) {
    return {
      kind: 'choice',
      phrase: item.phrase,
      raw: item.raw,
      reason: resolution.rung,
      choices: toChoices(resolution),
    }
  }

  // Kimlik tamam, miktar cevaplanamadı → gramaj sor
  if (!portion.grams) {
    return {
      kind: 'amount',
      phrase: item.phrase,
      raw: item.raw,
      reason: portion.rung,
      choices: [],
      food_label: resolution.ref.label,
      ...(resolution.ref.kind === 'curated'
        ? { food_item_id: resolution.ref.id }
        : { corpus_fdc_id: resolution.ref.id }),
      resolve_rung: resolution.rung,
    }
  }

  return null
}
