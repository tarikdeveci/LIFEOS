// Kural tabanlı çıkarıcı — anahtarsız, ağsız, deterministik.
//
// Ücretsiz kullanıcının gördüğü hat budur ve sağlayıcı kesintisinde de devreye
// giren hat budur. Model katmanı kadar cesur değildir (daha sık soru sorar) ama
// aynı girdiye her zaman aynı cevabı verir ve hiçbir şey uydurmaz.

import { detectFlags, normalizePhrase, parseQuantity, splitInput } from './normalize.ts'
import type { ExtractedItem, Extractor } from './types.ts'

const PREPARATIONS: [RegExp, string][] = [
  [/\bhaslan?mis|haslama\b/, 'haşlanmış'],
  [/\bizgara|mangal\b/, 'ızgara'],
  [/\bkizar(mis|tilmis)|kizartma|fried\b/, 'kızartılmış'],
  [/\bfirinda|firinlanmis|baked\b/, 'fırında'],
  [/\bcig|raw\b/, 'çiğ'],
  [/\bkavrulmus|roasted\b/, 'kavrulmuş'],
  [/\bsahanda\b/, 'sahanda'],
  [/\bbuharda|steamed\b/, 'buharda'],
]

function detectPreparation(phrase: string): string | null {
  const normalized = normalizePhrase(phrase)
  for (const [pattern, label] of PREPARATIONS) {
    if (pattern.test(normalized)) return label
  }
  return null
}

export function extractWithRules(input: string): ExtractedItem[] {
  const parts = splitInput(input)
  const items: ExtractedItem[] = []

  for (const raw of parts) {
    const flags = detectFlags(raw)
    const { quantity, unit, phrase } = parseQuantity(raw)

    // Enjeksiyon işareti taşıyan ya da "hiçbir şey yemedim" diyen parça
    // çözümlemeye sokulmaz; bayrağıyla birlikte yukarı taşınır.
    if (flags.length > 0) {
      items.push({
        phrase: phrase || normalizePhrase(raw),
        raw,
        quantity: null,
        unit: null,
        preparation: null,
        confidence: 0,
        flags,
      })
      continue
    }

    if (!phrase) continue

    items.push({
      phrase,
      raw,
      quantity,
      unit,
      preparation: detectPreparation(raw),
      // Kural katmanı ifadeyi doğru ayıklar ama "bu gerçekten bir yiyecek mi"
      // sorusunu cevaplayamaz; bu yüzden orta seviye güvenle işaretlenir.
      confidence: 0.6,
      flags: [],
    })
  }

  return items
}

export function createRulesExtractor(): Extractor {
  return {
    name: 'rules-v1',
    extract(input: string): Promise<ExtractedItem[]> {
      return Promise.resolve(extractWithRules(input))
    },
  }
}
