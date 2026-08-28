// Beslenme çözümleme hattının domain tipleri.
//
// Tek kural bu dosyanın tamamını açıklar: besin değeri yalnızca `Per100g` taşıyan
// bir veritabanı referansından (`FoodRef`) türetilebilir. Modelden dönen hiçbir
// yapıda kalori/makro alanı YOKTUR — model tarif eder, kapalı listeden seçer,
// gerekirse gram tahmin eder; aritmetiği compute.ts yapar.

export interface Per100g {
  kcal: number
  protein: number
  carbs: number
  fat: number
  fiber: number
}

export interface Interval {
  min: number
  likely: number
  max: number
}

// ============================
// Veri katmanı
// ============================

/** food_items satırı — küratörlü katman. Makrolar `serving_size` başınadır. */
export interface CuratedFood {
  id: string
  name: string
  name_en: string | null
  aliases: string[]
  serving_size: number
  serving_unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  category: string | null
  is_countable: boolean
}

/** food_corpus satırı — küratörsüz USDA katmanı. Makrolar 100 g başınadır. */
export interface CorpusFood {
  fdc_id: string
  description: string
  search_text: string
  dataset: string
  kcal: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  measure_grams: number[]
  score: number
}

export type FoodSource = 'curated' | 'corpus'

export interface FoodRef {
  kind: FoodSource
  id: string
  label: string
  per100g: Per100g
  /** küratörlü satırın porsiyon büyüklüğü (gram/ml); korpusta null */
  servingSize: number | null
  servingUnit: string
  /** serving_size tek bir parçayı temsil ediyor mu (1 yumurta, 1 dilim ekmek) */
  isCountable: boolean
  /** korpus satırının bildirdiği ev ölçüsü gramajları */
  measureGrams: number[]
}

// ============================
// Çıkarım (extract)
// ============================

export type ExtractFlag = 'non_food' | 'injection' | 'nothing_eaten'

export interface ExtractedItem {
  /** yiyeceği tanımlayan, miktarı ayıklanmış ifade */
  phrase: string
  /** kullanıcının yazdığı ham parça */
  raw: string
  quantity: number | null
  /** normalize edilmiş birim anahtarı: 'g' | 'ml' | 'adet' | 'dilim' | 'porsiyon' ... */
  unit: string | null
  preparation: string | null
  confidence: number
  flags: ExtractFlag[]
}

// ============================
// Çözümleme (resolve)
// ============================

export type ResolveRung =
  | 'user_alias'       // bu kullanıcı bu ifadeyi daha önce düzeltti
  | 'global_alias'     // küratörlü satırın kendi alias'ı, tam eşleşme
  | 'lexical'          // sözlüksel skor hem yüksek hem açık ara
  | 'lexical_verified' // makul ama bariz değil → model doğruladı
  | 'corpus_verified'  // küratörsüz korpus + model doğrulaması (tavan 0.6)
  | 'choices'          // kabul edilecek kadar emin değil → kapalı kısa liste, kabul yok
  | 'unresolved'       // kullanıcıya tek hedefli soru

export interface Candidate {
  ref: FoodRef
  score: number
}

export interface Resolution {
  rung: ResolveRung
  ref: FoodRef | null
  confidence: number
  margin: number
  candidates: Candidate[]
}

// ============================
// Porsiyon (portion)
// ============================

export type PortionRung =
  | 'stated_mass'       // "180 g tavuk" — hesaplanacak bir şey yok
  | 'stated_volume'     // "1.5 litre su"
  | 'user_memory'       // bu kişi bu ifadenin gramajını daha önce onayladı
  | 'household_measure' // "2 dilim", "bir kase" — gıdanın kendi ölçü yayılımı
  | 'serving_default'   // miktar yok → 1 porsiyon
  | 'model_estimate'    // hiçbir basamak cevaplayamadı, model gram tahmin etti
  | 'unknown'           // cevaplanamadı → kullanıcıya sorulur

export interface Portion {
  rung: PortionRung
  /** null → cevaplanamadı; tahmin YÜRÜTÜLMEZ, soru sorulur */
  grams: Interval | null
  tolerance: number
  /** ekranda gösterilecek birim ve miktar ('2 dilim', '180 g') */
  displayAmount: number
  displayUnit: string
}

// ============================
// Sonuç
// ============================

export type Disposition = 'auto' | 'confirm'

export interface ParsedMealItem {
  // --- eski sözleşme (web + mobil bu alanları okuyor, bozulmamalı) ---
  name: string
  amount: number
  unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  food_item_id?: string
  /** korpus satırının İngilizce açıklaması; `name` kullanıcının ifadesi olduğunda kaynağı gösterir */
  source_label?: string

  // --- yeni: aralık, kaynak ve hangi basamağın cevapladığı ---
  grams: number
  calories_min: number
  calories_max: number
  corpus_fdc_id?: string
  source: FoodSource
  resolve_rung: ResolveRung
  portion_rung: PortionRung
  portion_tolerance: number
  confidence: number
  disposition: Disposition
  phrase: string
}

export type QuestionKind = 'choice' | 'amount'

export interface QuestionChoice {
  id: string
  source: FoodSource
  label: string
  kcal_per_100g: number
}

export interface MealQuestion {
  kind: QuestionKind
  phrase: string
  raw: string
  reason: ResolveRung | PortionRung
  choices: QuestionChoice[]
  /** 'amount' sorularında hangi yiyeceğin gramajı soruluyor */
  food_label?: string
  food_item_id?: string
  corpus_fdc_id?: string
  /** Miktar sorularında kimliğin hangi basamakta çözüldüğünü korur. */
  resolve_rung?: ResolveRung
}

export interface ItemTrace {
  phrase: string
  raw: string
  resolve_rung: ResolveRung
  portion_rung: PortionRung
  margin: number
  confidence: number
  candidates: { id: string; label: string; score: number }[]
}

export interface ParseMealResult {
  items: ParsedMealItem[]
  questions: MealQuestion[]

  total_calories: number
  total_protein: number
  total_carbs: number
  total_fat: number
  total_fiber: number
  total_calories_min: number
  total_calories_max: number

  /** eski sözleşme: kaç kalem DB'den geldi / kaç kalemde model devreye girdi */
  matched_from_db: number
  estimated_by_ai: number

  version: string
  trace: ItemTrace[]
}

// ============================
// Bağımlılıklar (enjekte edilir — çekirdek Deno/Node bağımsızdır)
// ============================

export interface AliasTarget {
  food_item_id?: string
  corpus_fdc_id?: string
}

export interface FoodRepo {
  curated(): Promise<CuratedFood[]>
  searchCorpus(query: string, limit: number): Promise<CorpusFood[]>
  corpusByIds(ids: string[]): Promise<CorpusFood[]>
  userAliases(): Promise<Map<string, AliasTarget>>
  portionMemory(): Promise<Map<string, number>>
  recordGaps(gaps: { phrase: string; reason: string }[]): Promise<void>
}

export interface Extractor {
  name: string
  extract(input: string): Promise<ExtractedItem[]>
}

export interface Verifier {
  name: string
  /** kapalı listeden bir id döndürür; hiçbiri uymuyorsa null (fail-closed) */
  verify(phrase: string, candidates: Candidate[]): Promise<string | null>
}

export interface PortionEstimator {
  name: string
  /** yalnızca GRAM tahmin eder — besin değeri asla */
  estimate(
    phrase: string,
    foodLabel: string,
    quantity: number | null,
    unit: string | null,
  ): Promise<Interval | null>
}

export interface ParseDeps {
  repo: FoodRepo
  extractor: Extractor
  verifier: Verifier | null
  portionEstimator: PortionEstimator | null
}
