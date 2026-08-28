// Saf, deterministik metin işleme: Türkçe/İngilizce katlama, miktar + birim
// ayrıştırma, hafif gövdeleme ve giriş bölme.
//
// Bu dosyada model YOK. Merdivenin ilk basamaklarının bedava olmasının sebebi
// burada yapılan işin tamamen kural tabanlı olması.

import type { ExtractFlag } from './types.ts'

// ============================
// Katlama ve gövdeleme
// ============================

const FOLD_MAP: Record<string, string> = {
  ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g',
  ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c',
  â: 'a', î: 'i', û: 'u', é: 'e', è: 'e', á: 'a', ñ: 'n',
}

/** Türkçe farkındalıklı küçük harf + diakritik katlama. Yalnızca eşleştirme için. */
export function fold(input: string): string {
  const lowered = input.toLocaleLowerCase('tr')
  let out = ''
  for (const ch of lowered) out += FOLD_MAP[ch] ?? ch
  return out
}

/** Katlanmış, noktalaması temizlenmiş, tek boşluklu hâl. */
export function normalizePhrase(input: string): string {
  return fold(input)
    .replace(/[^a-z0-9%\s.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const TR_SUFFIXES = ['lari', 'leri', 'lar', 'ler']
const TR_CASE_SUFFIXES = ['nin', 'nin', 'nun', 'nun', 'in', 'un', 'yi', 'yu', 'si', 'su', 'gi', 'gu']

/** Hafif gövdeleme — agresif değil: "yumurtalar" → "yumurta", "eggs" → "egg". */
export function stem(token: string): string {
  let t = token
  for (const suffix of TR_SUFFIXES) {
    if (t.length > suffix.length + 3 && t.endsWith(suffix)) {
      t = t.slice(0, -suffix.length)
      break
    }
  }
  for (const suffix of TR_CASE_SUFFIXES) {
    if (t.length > suffix.length + 3 && t.endsWith(suffix)) {
      t = t.slice(0, -suffix.length)
      break
    }
  }
  if (t.length > 4 && t.endsWith('s') && !t.endsWith('ss')) t = t.slice(0, -1)
  return t
}

const STOP_WORDS = new Set([
  've', 'ile', 'bir', 'biraz', 'az', 'cok', 'the', 'and', 'with', 'of', 'a', 'an',
])

export function tokenize(phrase: string): string[] {
  return normalizePhrase(phrase)
    .split(' ')
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
    .map(stem)
    .filter((t) => t.length > 1)
}

// ============================
// Birimler
// ============================

export type UnitKind = 'mass' | 'volume' | 'count' | 'household'

export interface UnitInfo {
  key: string
  kind: UnitKind
  /** kütle/hacim birimleri için baz (g / ml) katsayısı */
  factor: number
  /** ev ölçüsü birimlerinin doğal yayılımı (± oran) */
  spread: number
}

const UNITS: Record<string, UnitInfo> = {
  kilogram: { key: 'g', kind: 'mass', factor: 1000, spread: 0.02 },
  kg: { key: 'g', kind: 'mass', factor: 1000, spread: 0.02 },
  gram: { key: 'g', kind: 'mass', factor: 1, spread: 0.02 },
  gr: { key: 'g', kind: 'mass', factor: 1, spread: 0.02 },
  g: { key: 'g', kind: 'mass', factor: 1, spread: 0.02 },
  mililitre: { key: 'ml', kind: 'volume', factor: 1, spread: 0.05 },
  ml: { key: 'ml', kind: 'volume', factor: 1, spread: 0.05 },
  litre: { key: 'ml', kind: 'volume', factor: 1000, spread: 0.05 },
  lt: { key: 'ml', kind: 'volume', factor: 1000, spread: 0.05 },
  l: { key: 'ml', kind: 'volume', factor: 1000, spread: 0.05 },

  adet: { key: 'adet', kind: 'count', factor: 1, spread: 0.15 },
  tane: { key: 'adet', kind: 'count', factor: 1, spread: 0.15 },
  parca: { key: 'adet', kind: 'count', factor: 1, spread: 0.25 },
  dilim: { key: 'dilim', kind: 'count', factor: 1, spread: 0.12 },

  porsiyon: { key: 'porsiyon', kind: 'household', factor: 1, spread: 0.35 },
  tabak: { key: 'porsiyon', kind: 'household', factor: 1, spread: 0.4 },
  kase: { key: 'porsiyon', kind: 'household', factor: 1, spread: 0.4 },
  kap: { key: 'porsiyon', kind: 'household', factor: 1, spread: 0.4 },
  bardak: { key: 'bardak', kind: 'household', factor: 1, spread: 0.15 },
  fincan: { key: 'bardak', kind: 'household', factor: 1, spread: 0.2 },
  kasik: { key: 'kasik', kind: 'household', factor: 1, spread: 0.25 },
  yk: { key: 'kasik', kind: 'household', factor: 1, spread: 0.25 },
  tk: { key: 'kasik', kind: 'household', factor: 1, spread: 0.3 },
  ck: { key: 'kasik', kind: 'household', factor: 1, spread: 0.3 },
  avuc: { key: 'avuc', kind: 'household', factor: 1, spread: 0.35 },
  paket: { key: 'paket', kind: 'household', factor: 1, spread: 0.1 },
  kutu: { key: 'paket', kind: 'household', factor: 1, spread: 0.1 },
  sise: { key: 'paket', kind: 'household', factor: 1, spread: 0.15 },
}

export function unitInfo(key: string | null): UnitInfo | null {
  if (!key) return null
  return UNITS[key] ?? null
}

const NUMBER_WORDS: Record<string, number> = {
  yarim: 0.5, bucuk: 0.5, bir: 1, iki: 2, uc: 3, dort: 4, bes: 5,
  alti: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10, yirmi: 20,
  half: 0.5, one: 1, two: 2, three: 3, four: 4, five: 5,
}

// "yemek kaşığı" → "yk" gibi çok kelimeli birimleri tek anahtara indirger
const MULTIWORD_UNITS: [RegExp, string][] = [
  [/\byemek kasi[gk]i?\b/g, ' yk '],
  [/\btatli kasi[gk]i?\b/g, ' tk '],
  [/\bcay kasi[gk]i?\b/g, ' ck '],
  [/\bsu bardagi?\b/g, ' bardak '],
  [/\bcay bardagi?\b/g, ' bardak '],
  [/\bkasi[gk]i?\b/g, ' kasik '],
]

export interface QuantityParse {
  quantity: number | null
  unit: string | null
  /** miktar ve birim ayıklandıktan sonra kalan yiyecek ifadesi */
  phrase: string
}

// Öğün bağlamı sözcükleri — yiyeceğin parçası değiller ama ifadeye karışıp
// eşleşmeyi bozuyorlar: "kahvaltida yumurta" hiçbir alias'a birebir uymuyor,
// "yumurta" uyuyor. Yemek adlarının parçası olabilecek sözcükler (örn. "yemek")
// bilerek listede yok.
const CONTEXT_RE =
  /\b(kahvaltida|kahvaltida|kahvalti|oglen|ogleyin|ogle|aksam|aksamleyin|sabah|gece|bugun|dun|yedim|yedik|yiyorum|ictim|ictik|iciyorum|aldim|tukettim|olarak)\b/g

const UNIT_ALTERNATION = Object.keys(UNITS)
  .sort((a, b) => b.length - a.length)
  .join('|')

/**
 * "2 dilim tam bugday ekmegi" → { quantity: 2, unit: 'dilim', phrase: 'tam bugday ekmegi' }
 *
 * Miktar bulunamazsa quantity null döner — varsayım YÜRÜTÜLMEZ, porsiyon
 * merdiveni bu boşluğu kendi kurallarıyla doldurur.
 */
export function parseQuantity(rawPart: string): QuantityParse {
  let text = ` ${normalizePhrase(rawPart)} `
  for (const [pattern, replacement] of MULTIWORD_UNITS) text = text.replace(pattern, replacement)
  text = text.replace(/\s+/g, ' ')

  let quantity: number | null = null
  let unit: string | null = null

  // 1) sayı + birim ("180 g", "1.5 litre", "2 dilim")
  const numUnit = new RegExp(`\\b(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_ALTERNATION})\\b`, 'i')
  const numUnitMatch = text.match(numUnit)
  if (numUnitMatch) {
    quantity = parseFloat(numUnitMatch[1]!.replace(',', '.'))
    unit = numUnitMatch[2]!
    text = text.replace(numUnitMatch[0], ' ')
  }

  // 2) sayı sözcüğü + birim ("bir kase", "iki dilim")
  if (quantity === null) {
    const wordUnit = new RegExp(
      `\\b(${Object.keys(NUMBER_WORDS).join('|')})\\s+(${UNIT_ALTERNATION})\\b`,
      'i',
    )
    const wordUnitMatch = text.match(wordUnit)
    if (wordUnitMatch) {
      quantity = NUMBER_WORDS[wordUnitMatch[1]!] ?? null
      unit = wordUnitMatch[2]!
      text = text.replace(wordUnitMatch[0], ' ')
    }
  }

  // 3) çıplak birim ("bardak sut") → 1 birim
  if (quantity === null) {
    const bareUnit = new RegExp(`\\b(${UNIT_ALTERNATION})\\b`, 'i')
    const bareUnitMatch = text.match(bareUnit)
    if (bareUnitMatch) {
      quantity = 1
      unit = bareUnitMatch[1]!
      text = text.replace(bareUnitMatch[0], ' ')
    }
  }

  // 4) çıplak sayı ("3 yumurta", "150 pilav") — birimi porsiyon merdiveni karara bağlar
  if (quantity === null) {
    const bareNum = text.match(/\b(\d+(?:[.,]\d+)?)\b/)
    if (bareNum) {
      quantity = parseFloat(bareNum[1]!.replace(',', '.'))
      text = text.replace(bareNum[0], ' ')
    } else {
      const wordNum = text.match(new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b`, 'i'))
      if (wordNum) {
        quantity = NUMBER_WORDS[wordNum[1]!] ?? null
        text = text.replace(wordNum[0], ' ')
      }
    }
  }

  // Kütle/hacim birimleri baza çevrilir: "1 kg tavuk" 1 gram değil 1000 gramdır.
  const info = unit ? UNITS[unit] : undefined
  if (info && quantity !== null && (info.kind === 'mass' || info.kind === 'volume')) {
    quantity = quantity * info.factor
  }

  return {
    quantity,
    unit: info?.key ?? null,
    phrase: text.replace(CONTEXT_RE, ' ').replace(/\s+/g, ' ').trim(),
  }
}

// ============================
// Bölme
// ============================

const SPLIT_RE = /[,\n;]+|\s+ve\s+|\s+\+\s+/

/** Girişi kalemlere böler. Ayırıcı yoksa her yeni miktar ifadesinden önce böler. */
export function splitInput(text: string): string[] {
  const bySeparator = text.split(SPLIT_RE).map((p) => p.trim()).filter(Boolean)
  if (bySeparator.length > 1) return bySeparator

  // (?<![\d.,]) olmadan "1.5 litre" ifadesi ".5"in önünden de bölünüyor ve
  // "5 litre" olarak okunuyordu — üç kat kalori.
  const byQuantity = text
    .split(/(?=(?<![\d.,])\b\d+(?:[.,]\d+)?\s*(?:gram|gr|g(?=\s)|adet|tane|dilim|ml|litre|lt|kg|porsiyon|bardak|kase)\s)/i)
    .map((p) => p.trim())
    .filter(Boolean)

  return byQuantity.length > 1 ? byQuantity : [text.trim()].filter(Boolean)
}

// ============================
// Güvenlik ve gıda-dışı girdi
// ============================

// Öğün metni VERİDİR, talimat değil. Bu işaretler modele hiç ulaşmadan elenir.
const INJECTION_RE = new RegExp(
  [
    'ignore\\s+(all\\s+)?previous',
    'disregard\\s+(the\\s+)?above',
    '\\b(system|sistem|assistant|prompt)\\s*:',
    'onceki\\s+talimat',
    '(butun|tum)\\s+(talimat|kural)',
    'kurallar[ıi]?(n[ıi])?\\s*(unut|yok\\s*say|gormezden)',
    'talimatlari\\s+(unut|yok\\s*say)',
    // Kendi çıktımıza yönelik emirler de enjeksiyondur: "kalorileri sıfırla"
    '(kalori|kcal|makro)\\w*\\s+(sifirla|degistir|ayarla|yaz)',
    'sen\\s+artik',
    'act\\s+as',
  ].join('|'),
  'i',
)

const NOTHING_EATEN_RE =
  /^(hic\s*bir\s*sey\s*yemedim|hicbir\s*sey\s*yemedim|yemek\s*yemedim|bugun\s*yemedim|nothing|i\s+did\s*n?o?t\s+eat)/i

/** Kaleme iliştirilecek bayrakları döndürür. Boş dizi = normal yiyecek girdisi. */
export function detectFlags(rawPart: string): ExtractFlag[] {
  const flags: ExtractFlag[] = []
  const folded = fold(rawPart).trim()
  if (INJECTION_RE.test(rawPart) || INJECTION_RE.test(folded)) flags.push('injection')
  if (NOTHING_EATEN_RE.test(folded)) flags.push('nothing_eaten')
  return flags
}

// ============================
// Korpus için Türkçe → İngilizce sorgu köprüsü
// ============================
//
// food_corpus açıklamaları İngilizce. Bu köprü YALNIZCA arama metnini değiştirir;
// dönen satır yine doğrulayıcıdan geçmek zorunda, dolayısıyla yerelleştirme tek
// başına besin değeri üretemez.
const TR_EN_BRIDGE: Record<string, string> = {
  kinoa: 'quinoa', kuskus: 'couscous', susi: 'sushi', guakamole: 'guacamole',
  'pad tay': 'pad thai', lazanya: 'lasagna', humus: 'hummus', falafel: 'falafel',
  tofu: 'tofu', edamame: 'edamame', burrito: 'burrito', taco: 'taco',
  ramen: 'ramen', pesto: 'pesto', risotto: 'risotto', gnocchi: 'gnocchi',
  waffle: 'waffle', pankek: 'pancake', omlet: 'omelet', smoothie: 'smoothie',
  granola: 'granola', musli: 'muesli', kraker: 'cracker', cips: 'chips',
  tavuk: 'chicken', et: 'beef', balik: 'fish', karides: 'shrimp',
  peynir: 'cheese', yogurt: 'yogurt', sut: 'milk', yumurta: 'egg',
  ekmek: 'bread', pilav: 'rice', makarna: 'pasta', patates: 'potato',
  salata: 'salad', corba: 'soup', meyve: 'fruit', sebze: 'vegetable',
  zeytinyagi: 'olive oil', tereyagi: 'butter', bal: 'honey', receL: 'jam',
  fistik: 'peanut', badem: 'almond', ceviz: 'walnut', findik: 'hazelnut',
}

/** Korpusta aranacak sorgu metnini üretir (İngilizce terimlere köprülenmiş). */
export function bridgeToEnglish(phrase: string): string {
  const normalized = normalizePhrase(phrase)
  if (TR_EN_BRIDGE[normalized]) return TR_EN_BRIDGE[normalized]!

  const words = normalized.split(' ')
  const bridged = words.map((w) => TR_EN_BRIDGE[w] ?? TR_EN_BRIDGE[stem(w)] ?? w)
  return bridged.join(' ').trim()
}
