// Beslenme domain types
// Şema: supabase/migrations/002_nutrition_schema.sql

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export type FoodCategory =
  | 'protein'
  | 'carb'
  | 'fat'
  | 'vegetable'
  | 'fruit'
  | 'dairy'
  | 'grain'
  | 'beverage'
  | 'other'

export interface Macros {
  calories: number
  protein: number  // gram
  carbs: number    // gram
  fat: number      // gram
  fiber: number    // gram
}

// Çözümleme merdiveninin hangi basamağının cevapladığı.
// Kaynak: supabase/functions/_shared/nutrition/types.ts
export type ResolveRung =
  | 'user_alias'
  | 'global_alias'
  | 'lexical'
  | 'lexical_verified'
  | 'corpus_verified'
  | 'choices'
  | 'unresolved'

export type PortionRung =
  | 'stated_mass'
  | 'stated_volume'
  | 'user_memory'
  | 'household_measure'
  | 'serving_default'
  | 'model_estimate'
  | 'unknown'

export type FoodSource = 'curated' | 'corpus'

export interface MealItem extends Macros {
  name: string
  amount: number
  unit: string      // 'g', 'ml', 'adet', 'dilim', 'yk', ...
  food_item_id?: string // food_items tablosunda match varsa

  // --- çözümleme hattından gelen alanlar (elle eklenen kalemlerde yok) ---
  /**
   * Korpus satırının İngilizce açıklaması. Korpus eşleşmelerinde `name`
   * kullanıcının kendi ifadesidir (Türkçe); bu alan hangi USDA satırının
   * eşleştiğini gösterir, "onayla" kararı buna bakılarak verilir.
   */
  source_label?: string
  grams?: number
  calories_min?: number
  calories_max?: number
  corpus_fdc_id?: string
  source?: FoodSource
  resolve_rung?: ResolveRung
  portion_rung?: PortionRung
  portion_tolerance?: number
  confidence?: number
  disposition?: 'auto' | 'confirm'
  phrase?: string
}

export interface QuestionChoice {
  id: string
  source: FoodSource
  label: string
  kcal_per_100g: number
}

/**
 * Elle arama sonucundaki satır. `QuestionChoice`'ı genişletir, böylece seçim
 * doğrudan `buildItemFromChoice`'a verilebilir.
 */
export interface FoodSearchResult extends QuestionChoice {
  /** Gramaj girilmezse kullanılacak varsayılan porsiyon. */
  default_grams: number
  /** Küratörlü satırlarda doğrulanma durumu. */
  verified?: boolean
  /** Korpus satırlarında kaynak set: sr_legacy | survey | foundation. */
  dataset?: string
}

/** Çözülemeyen kalem: kapalı liste ya da gramaj sorusu. */
export interface MealQuestion {
  kind: 'choice' | 'amount'
  phrase: string
  raw: string
  reason: ResolveRung | PortionRung
  choices: QuestionChoice[]
  food_label?: string
  food_item_id?: string
  corpus_fdc_id?: string
  resolve_rung?: ResolveRung
}

export interface ParseTraceEntry {
  phrase: string
  raw: string
  resolve_rung: ResolveRung
  portion_rung: PortionRung
  margin: number
  confidence: number
  candidates: { id: string; label: string; score: number }[]
}

export interface Meal {
  id: string
  user_id: string
  date: string      // 'YYYY-MM-DD'
  meal_type: MealType
  raw_input: string | null // Kullanıcının girdiği ham metin

  items: MealItem[]

  // Toplam makrolar (items'dan hesaplanan)
  total_calories: number
  total_protein: number
  total_carbs: number
  total_fat: number
  total_fiber: number

  notes: string | null
  parse_trace?: ParseTraceEntry[] | null
  parse_version?: string | null
  created_at: string
  updated_at: string
}

export interface FoodItem extends Macros {
  id: string
  user_id: string | null // NULL = global (seed data)
  name: string
  aliases: string[]
  serving_size: number
  serving_unit: string
  category: FoodCategory | null
  is_verified: boolean
  created_at: string
}

export interface NutritionTarget extends Macros {
  id: string
  user_id: string
  is_active: boolean
  // Spor günü override (opsiyonel)
  workout_day_calories: number | null
  workout_day_protein_g: number | null
  created_at: string
  updated_at: string
}

export interface MacroSummary extends Macros {
  date: string
  meal_count: number
}

export interface MacroProgress {
  current: number
  target: number
  percentage: number
  status: 'low' | 'ok' | 'over'  // < 80%: low, 80-110%: ok, > 110%: over
}

export interface DailyNutritionSummary {
  date: string
  totals: Macros
  target: NutritionTarget | null
  progress: {
    calories: MacroProgress
    protein: MacroProgress
    carbs: MacroProgress
    fat: MacroProgress
    fiber: MacroProgress
  }
  meals: Meal[]
}

// parse-meal edge function yanıtı
export interface ParseMealResponse {
  items: MealItem[]
  /** çözülemeyen kalemler — kullanıcıya sorulacaklar */
  questions: MealQuestion[]

  total_calories: number
  total_protein: number
  total_carbs: number
  total_fat: number
  total_fiber: number
  /** gösterilen aralığın uçları */
  total_calories_min: number
  total_calories_max: number

  matched_from_db: number
  estimated_by_ai: number

  version: string
  trace: ParseTraceEntry[]

  ai: {
    /** model katmanı gerçekten çalıştı mı (Pro olmak tek başına yetmez) */
    enabled: boolean
    pro: boolean
    /** 'credit' | 'rate_limit' | 'auth' | 'network' | 'unknown' */
    error: string | null
    model: string | null
  }
}

export interface CreateMealInput {
  date?: string
  meal_type: MealType
  raw_input?: string
  items?: MealItem[]
  notes?: string
  /** hangi kalemin neden o değeri aldığı — teşhis için saklanır */
  parse_trace?: ParseTraceEntry[]
  parse_version?: string
}

// ============================
// Geri bildirim
// ============================

/**
 * Kullanıcının bir çözümleme sonucuna itirazının türü.
 *
 * food_gaps hattın çözemediklerini toplar; bunlar ise hattın ÇÖZDÜĞÜ ama
 * yanlış çözdüğü vakalar — soru sorulmadığı için başka hiçbir yere düşmezler.
 */
export type NutritionFeedbackKind =
  | 'wrong_food'
  | 'missing_item'
  | 'wrong_portion'
  | 'wrong_macros'
  | 'other'

export interface NutritionFeedbackInput {
  /** Kaydedilmiş öğüne bağlıysa; henüz kaydedilmemiş çözümlemede boş kalır */
  meal_id?: string | null
  raw_input?: string | null
  /** İtiraz edilen kalemin ifadesi */
  phrase: string
  item_label?: string | null
  item_source?: 'curated' | 'corpus' | null
  item_ref_id?: string | null
  item_grams?: number | null
  item_kcal?: number | null
  kind: NutritionFeedbackKind
  note?: string | null
  expected_kcal?: number | null
  expected_grams?: number | null
  parse_version?: string | null
  /** Bildirim anındaki iz — sözlük sonradan düzelse bile teşhis kaybolmasın */
  trace?: ParseTraceEntry | null
}
