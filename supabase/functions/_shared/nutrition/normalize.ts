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
    // Türkçe'de ondalık ayırıcı virgüldür. Noktaya çevrilmezse bir sonraki adımda
    // silinir ve "1,5 porsiyon" → "1 5 porsiyon" olur; miktar 5 okunur, öğün üç
    // katına çıkar. Yalnızca İKİ rakamın arasındaki virgül ondalıktır — ayırıcı
    // olarak yazılan virgülün iki yanından en az biri rakam değildir.
    .replace(/(\d),(\d)/g, '$1.$2')
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
// "yemeginde"/"yemekte"/"ogunde" çekimli hâllerdir, yemek ADI olamazlar — bu
// yüzden listede yer alabiliyorlar. Çıplak "yemek" hâlâ dışarıda: "nohut yemeği"
// gerçek bir yiyecektir ve \b sınırları sayesinde bu ekler ona dokunmaz.
const CONTEXT_RE =
  /\b(kahvaltida|kahvalti|oglen|ogleyin|ogle|aksam|aksamleyin|sabah|gece|bugun|dun|yemeginde|yemekte|ogunde|yedim|yedik|yiyorum|ictim|ictik|iciyorum|aldim|tukettim|olarak)\b/g

const UNIT_ALTERNATION = Object.keys(UNITS)
  .sort((a, b) => b.length - a.length)
  .join('|')

// "bir buçuk" / "2 buçuk" TEK bir miktardır. Açılmazsa aşağıdaki sayı+birim
// eşleşmesi "buçuk porsiyon"a kilitlenir: 1.5 yerine 0.5 okunur ve öğün üçte
// birine iner. "yarım" tek başına zaten 0.5, önüne sayı almaz.
const HALF_RE = new RegExp(
  `\\b(\\d+(?:[.,]\\d+)?|${
    Object.keys(NUMBER_WORDS).filter((word) => word !== 'bucuk' && word !== 'yarim').join('|')
  })\\s+bucuk\\b`,
  'g',
)

function expandHalves(text: string): string {
  return text.replace(HALF_RE, (_match, num: string) => {
    const base = /^\d/.test(num) ? parseFloat(num.replace(',', '.')) : NUMBER_WORDS[num] ?? 0
    return ` ${base + 0.5} `
  })
}

function isBulkUnit(unitKey: string): boolean {
  const info = UNITS[unitKey]
  return info !== undefined && (info.kind === 'mass' || info.kind === 'volume')
}

interface Extraction {
  quantity: number | null
  /** UNITS anahtarı — baz katsayısı HENÜZ uygulanmadı. */
  unit: string | null
  /** miktar ayıklandıktan sonra kalan metin */
  rest: string
}

/** Metinden TEK bir miktar ifadesi söker. Merdiven: sayı+birim → sözcük+birim → çıplak birim → çıplak sayı. */
function extractOnce(text: string): Extraction {
  // 1) sayı + birim ("180 g", "1.5 litre", "2 dilim")
  const numUnit = new RegExp(`\\b(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_ALTERNATION})\\b`, 'i')
  const numUnitMatch = text.match(numUnit)
  if (numUnitMatch) {
    return {
      quantity: parseFloat(numUnitMatch[1]!.replace(',', '.')),
      unit: numUnitMatch[2]!,
      rest: text.replace(numUnitMatch[0], ' '),
    }
  }

  // 2) sayı sözcüğü + birim ("bir kase", "iki dilim")
  const wordUnit = new RegExp(
    `\\b(${Object.keys(NUMBER_WORDS).join('|')})\\s+(${UNIT_ALTERNATION})\\b`,
    'i',
  )
  const wordUnitMatch = text.match(wordUnit)
  if (wordUnitMatch) {
    return {
      quantity: NUMBER_WORDS[wordUnitMatch[1]!] ?? null,
      unit: wordUnitMatch[2]!,
      rest: text.replace(wordUnitMatch[0], ' '),
    }
  }

  // 3) çıplak birim ("bardak sut") → 1 birim
  const bareUnit = new RegExp(`\\b(${UNIT_ALTERNATION})\\b`, 'i')
  const bareUnitMatch = text.match(bareUnit)
  if (bareUnitMatch) {
    return { quantity: 1, unit: bareUnitMatch[1]!, rest: text.replace(bareUnitMatch[0], ' ') }
  }

  // 4) çıplak sayı ("3 yumurta", "150 pilav") — birimi porsiyon merdiveni karara bağlar
  const bareNum = text.match(/\b(\d+(?:[.,]\d+)?)\b/)
  if (bareNum) {
    return {
      quantity: parseFloat(bareNum[1]!.replace(',', '.')),
      unit: null,
      rest: text.replace(bareNum[0], ' '),
    }
  }
  const wordNum = text.match(new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b`, 'i'))
  if (wordNum) {
    return {
      quantity: NUMBER_WORDS[wordNum[1]!] ?? null,
      unit: null,
      rest: text.replace(wordNum[0], ' '),
    }
  }

  return { quantity: null, unit: null, rest: text }
}

/**
 * "2 dilim tam bugday ekmegi" → { quantity: 2, unit: 'dilim', phrase: 'tam bugday ekmegi' }
 *
 * Miktar bulunamazsa quantity null döner — varsayım YÜRÜTÜLMEZ, porsiyon
 * merdiveni bu boşluğu kendi kurallarıyla doldurur.
 */
export function parseQuantity(rawPart: string): QuantityParse {
  let text = ` ${normalizePhrase(rawPart)} `
  for (const [pattern, replacement] of MULTIWORD_UNITS) text = text.replace(pattern, replacement)
  text = expandHalves(text).replace(/\s+/g, ' ')

  const first = extractOnce(text)
  let quantity = first.quantity
  let unit = first.unit
  let rest = first.rest

  // Tek kalem İKİ miktar ifadesi taşıyabilir: "3 tane 100 gram köfte". Tek geçişte
  // ikincisi ifadede kalır ("100 gram kofte") ve kalem hiçbir yiyeceğe oturmaz.
  //
  // Birleştirme yalnızca İKİSİNİN DE açık birimi varsa yapılır. Bu şart olmadan
  // "%3 yağlı süt 200 ml" ifadesindeki "3" ikinci miktar sanılır ve hacim 600 ml
  // olur — oysa o rakam yiyecek adının parçasıdır.
  if (quantity !== null && unit !== null) {
    const second = extractOnce(rest)
    if (second.quantity !== null && second.unit !== null) {
      const firstIsBulk = isBulkUnit(unit)
      const secondIsBulk = isBulkUnit(second.unit)
      // adet × kütle = toplam kütle. Aynı türdeyseler ilki geçerli sayılır;
      // ikincisi her hâlükârda ifadeden düşer, yoksa yiyecek adına yapışır.
      if (secondIsBulk && !firstIsBulk) {
        quantity = quantity * second.quantity
        unit = second.unit
      } else if (firstIsBulk && !secondIsBulk) {
        quantity = quantity * second.quantity
      }
      rest = second.rest
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
    phrase: rest.replace(CONTEXT_RE, ' ').replace(/\s+/g, ' ').trim(),
  }
}

// ============================
// Bölme
// ============================

// Virgül/"ve" dışında Türkçe bileşik tabak kalıpları da ayırıcıdır. Bunlar
// olmadan "pilav üstü et döner" tek kaleme düşüyor, sözlükte "et döner"e
// oturuyor ve pilav sessizce kayboluyordu: tabağın yarısı hiç sayılmadığı için
// toplam kalori gerçeğin çok altında çıkıyordu. Ayırıcıların hepsi boşlukla
// çevrili aranır, böylece "ile" son eki (-yle/-la) yanlışlıkla bölmez.
//
// Virgül iki iş birden yapar: liste ayırıcısı VE Türkçe ondalık işareti. İki
// rakamın arasındaki virgül ondalıktır, ayırıcı değil — "1,5 porsiyon" oradan
// bölünürse "5 porsiyon" okunur. Ayırıcı olarak yazılan virgülün iki yanından
// en az biri rakam değildir, kural bu farkı kullanır.
const SPLIT_RE =
  /(?:[\n;]|(?<!\d),|,(?!\d))+|\s+ve\s+|\s+ile\s+|\s+\+\s+|\s+üst[üu]\s+|\s+[üu]zeri(?:ne)?\s+|\s+yan[ıi]nda\s+|\s+eşliğinde\s+/i

// Çok kelimeli birimlerin parçaları. Tek başlarına birim değiller ama yiyecek
// adı da değiller: "bal 1 yemek kaşığı" ifadesinde "yemek kaşığı"nı yiyecek
// sanan bir bölücü, yetim bir "1 yemek kaşığı" kalemi üretir.
const UNIT_WORDS = new Set<string>([
  ...Object.keys(UNITS),
  'yemek', 'tatli', 'cay', 'kasigi', 'bardagi', 'fincani',
])

// Bir miktar grubunu KAPATABİLECEK sözcükler. 'yemek'/'tatli'/'cay' bilerek dışarıda:
// bunlar ancak "yemek kaşığı" tamlamasının başında birimdir, tek başlarına grup
// bitirmezler. Listede olsalardı "…beyaz peynir çay" miktarla bitiyor sanılırdı.
const UNIT_TAIL_WORDS = new Set<string>([
  ...Object.keys(UNITS),
  'kasigi', 'bardagi', 'fincani',
])

/** Sözcüğü karşılaştırmaya hazır hâle getirir: katlanmış, noktalaması atılmış. */
function foldToken(token: string): string {
  return fold(token).replace(/[^a-z0-9.,%]/g, '')
}

function isNumberToken(folded: string): boolean {
  return /^\d+(?:[.,]\d+)?$/.test(folded)
}

/** Yeni bir kalem başlatabilecek çıpa: çıplak sayı ya da sayı sözcüğü. */
function isAnchor(folded: string): boolean {
  if (isNumberToken(folded)) return true
  // "buçuk" tek başına kalem başlatmaz: "bir buçuk porsiyon" tek bir miktardır.
  if (folded === 'bucuk') return false
  return Object.hasOwn(NUMBER_WORDS, folded)
}

/** Yiyecek adının parçası olabilecek sözcük — ne sayı ne birim. */
function isFoodish(folded: string): boolean {
  return folded.length > 1 && !isAnchor(folded) && folded !== 'bucuk' && !UNIT_WORDS.has(folded)
}

/**
 * Ayırıcısız girdiyi miktar çıpalarından böler: "2 yumurta 1 muz".
 *
 * Virgül beklemek bizim eksiğimizdi, kullanıcının hatası değil. Ama her çıpadan
 * bölmek de yanlış: bölme yalnızca çıpanın İKİ yanında da yiyecek adı varsa
 * yapılır. Bu koşul olmadan "tam buğday ekmeği 2 dilim" ifadesi ikiye ayrılıp
 * yetim bir "2 dilim" kalemi doğuruyor.
 */
function anchorCuts(folded: string[]): number[] {
  const cuts: number[] = []
  for (let i = 1; i < folded.length; i++) {
    if (!isAnchor(folded[i]!)) continue
    // "1.5" zaten tek token; "%3 yağlı" ve "1 5" gibi bitişik sayılar çıpa değil.
    if (folded[i - 1]!.endsWith('%') || isAnchor(folded[i - 1]!)) continue

    const start = cuts.length > 0 ? cuts[cuts.length - 1]! : 0
    if (!folded.slice(start, i).some(isFoodish)) continue
    if (!folded.slice(i).some(isFoodish)) continue
    cuts.push(i)
  }
  return cuts
}

/**
 * Miktarını arkaya yazan girdiyi böler: "yumurta 2 adet ekmek 1 dilim".
 *
 * Bu biçimde çıpadan bölmek kesimi yanlış yere koyar: "yulaf 40 gram muz 1 adet"
 * ifadesi "yulaf" + "40 gram muz 1 adet" olur, 40 gram yulafa değil muza yazılır
 * ve muz büsbütün kaybolur. Kesim yiyecek adının ÖNÜNDEN, tamamlanmış bir
 * sayı+birim grubunun ardından yapılır; grubun öncesinde de bir yiyecek adı
 * bulunmak zorundadır — bu şart "tam buğday ekmeği 2 dilim" ifadesini korur.
 */
function trailingGroupCuts(folded: string[]): number[] {
  const cuts: number[] = []
  for (let i = 2; i < folded.length; i++) {
    if (!isFoodish(folded[i]!)) continue
    if (!UNIT_TAIL_WORDS.has(folded[i - 1]!)) continue
    if (!isAnchor(folded[i - 2]!)) continue

    const start = cuts.length > 0 ? cuts[cuts.length - 1]! : 0
    if (!folded.slice(start, i - 2).some(isFoodish)) continue
    cuts.push(i)
  }
  return cuts
}

/** Girişi kalemlere böler. Ayırıcı yoksa miktar kalıplarından bölmeyi dener. */
export function splitInput(text: string): string[] {
  const bySeparator = text.split(SPLIT_RE).map((p) => p.trim()).filter(Boolean)
  if (bySeparator.length > 1) return bySeparator

  const single = [text.trim()].filter(Boolean)
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  if (tokens.length < 3) return single
  const folded = tokens.map(foldToken)

  // Girdi bir miktar grubuyla bitiyorsa kullanıcı miktarı arkaya yazıyor demektir
  // ve çıpa kesimi yanlış tarafa düşer. Kalıp tutmazsa çıpaya geri dönülür.
  const last = folded[folded.length - 1]!
  const writesQuantityLast = UNIT_TAIL_WORDS.has(last) || isAnchor(last)
  let cuts = writesQuantityLast ? trailingGroupCuts(folded) : []
  if (cuts.length === 0) cuts = anchorCuts(folded)
  if (cuts.length === 0) return single

  const bounds = [0, ...cuts, tokens.length]
  const parts: string[] = []
  for (let b = 0; b < bounds.length - 1; b++) {
    parts.push(tokens.slice(bounds[b], bounds[b + 1]).join(' '))
  }
  return parts
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
// Her giriş korpusa karşı sınandı: karşılığı olmayan terim eklenmedi (barbunya
// için "cranberry/borlotti beans" korpusta yok, besin değeri en yakın olan
// pinto'ya bağlandı). Köprü olmadan bu 13 bin satır Türkçe yazan kullanıcı için
// erişilemez durumdaydı — "roka" ile "arugula, raw" arasındaki trigram
// benzerliği sıfır.
const TR_EN_BRIDGE: Record<string, string> = {
  // Dünya mutfağı
  kinoa: 'quinoa', kuskus: 'couscous', susi: 'sushi', guakamole: 'guacamole',
  'pad tay': 'pad thai', lazanya: 'lasagna', humus: 'hummus', falafel: 'falafel',
  tofu: 'tofu', edamame: 'edamame', burrito: 'burrito', taco: 'taco',
  ramen: 'ramen', pesto: 'pesto', gnocchi: 'gnocchi',
  waffle: 'waffle', pankek: 'pancake', omlet: 'omelet', smoothie: 'smoothie',
  kraker: 'cracker', cips: 'chips',
  // "risotto" ve "muesli" korpusta hiç geçmiyordu; ölü giriş yerine en yakın
  // gerçek satıra bağlandılar.
  risotto: 'rice white', granola: 'cereal granola', musli: 'cereal granola',

  // Temel gruplar
  tavuk: 'chicken', et: 'beef', balik: 'fish', karides: 'shrimp',
  peynir: 'cheese', yogurt: 'yogurt', sut: 'milk', yumurta: 'egg',
  ekmek: 'bread', pilav: 'rice', makarna: 'pasta', patates: 'potato',
  salata: 'salad', corba: 'soup', meyve: 'fruit', sebze: 'vegetable',
  zeytinyagi: 'olive oil', tereyagi: 'butter', bal: 'honey',
  // Anahtar küçük harf olmalı: eskiden "receL" yazıldığı için hiç eşleşmiyordu.
  recel: 'jam',

  // Tohum, kuruyemiş, süperbesin
  chia: 'chia seeds', 'chia tohumu': 'chia seeds',
  keten: 'flaxseed', 'keten tohumu': 'flaxseed',
  'kabak cekirdegi': 'pumpkin seeds', aycekirdegi: 'sunflower seeds',
  susam: 'sesame seeds', tahin: 'tahini', karabugday: 'buckwheat',
  fistik: 'peanut', 'antep fistigi': 'pistachio', kaju: 'cashew',
  badem: 'almond', ceviz: 'walnut', findik: 'hazelnut',

  // Yeşillik ve sebze
  roka: 'arugula', semizotu: 'purslane', marul: 'lettuce', maydanoz: 'parsley',
  dereotu: 'dill', nane: 'mint', tere: 'cress', pazi: 'chard',
  kereviz: 'celery', turp: 'radish', lahana: 'cabbage', karnabahar: 'cauliflower',
  kabak: 'zucchini', patlican: 'eggplant', bamya: 'okra', enginar: 'artichoke',
  pirasa: 'leek', ispanak: 'spinach', brokoli: 'broccoli', mantar: 'mushrooms',
  sogan: 'onion', sarimsak: 'garlic', domates: 'tomato', salatalik: 'cucumber',
  biber: 'pepper',

  // Baklagil
  mercimek: 'lentils', nohut: 'chickpeas', fasulye: 'beans',
  barbunya: 'pinto beans', bezelye: 'peas', bakla: 'fava beans',

  // Meyve
  nar: 'pomegranate', incir: 'figs', kayisi: 'apricots', erik: 'plums',
  seftali: 'peaches', armut: 'pears', kiraz: 'cherries', visne: 'cherries sour',
  ayva: 'quince', hurma: 'dates', avokado: 'avocado', kivi: 'kiwifruit',
  ananas: 'pineapple', mandalina: 'tangerine', greyfurt: 'grapefruit',
  limon: 'lemon', karpuz: 'watermelon', kavun: 'melon', uzum: 'grapes',
  cilek: 'strawberries', muz: 'banana', elma: 'apple', portakal: 'orange',

  // Tahıl
  yulaf: 'oats', arpa: 'barley', cavdar: 'rye', misir: 'corn',
  bulgur: 'bulgur', irmik: 'semolina',

  // Süt ürünleri
  kefir: 'kefir', krema: 'cream',

  // Et ve deniz ürünleri
  hindi: 'turkey', kuzu: 'lamb', dana: 'beef', sucuk: 'sausage',
  pastirma: 'pastrami', salam: 'salami', sosis: 'sausage',
  hamsi: 'anchovy', sardalya: 'sardine', uskumru: 'mackerel',
  alabalik: 'trout', midye: 'mussel', ahtapot: 'octopus', kalamar: 'squid',
  ton: 'tuna', 'ton baligi': 'tuna',

  // Diğer
  pekmez: 'molasses', zeytin: 'olives', tursu: 'pickles', sirke: 'vinegar',
}

/**
 * Korpus satırları İngilizce açıklamalı ("Seeds, chia seeds, dried"). Türkçe
 * bilen kullanıcıya bunu göstermek kötü; öğün listesinde kendi yazdığı ifade
 * görünmeli. İngilizce açıklama kaybolmaz, kaynak olarak ayrıca taşınır.
 *
 * Büyük harf Türkçe kurallarıyla yapılır: "incir" → "İncir" (tr-TR olmadan
 * "Incir" çıkardı).
 */
export function displayLabelFromPhrase(phrase: string, fallback: string): string {
  const trimmed = phrase.trim()
  if (!trimmed) return fallback
  return trimmed.charAt(0).toLocaleUpperCase('tr-TR') + trimmed.slice(1)
}

/** Korpusta aranacak sorgu metnini üretir (İngilizce terimlere köprülenmiş). */
export function bridgeToEnglish(phrase: string): string {
  const normalized = normalizePhrase(phrase)
  if (TR_EN_BRIDGE[normalized]) return TR_EN_BRIDGE[normalized]!

  const words = normalized.split(' ')
  const bridged = words.map((w) => TR_EN_BRIDGE[w] ?? TR_EN_BRIDGE[stem(w)] ?? w)
  return bridged.join(' ').trim()
}
