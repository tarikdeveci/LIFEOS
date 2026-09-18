import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'
import { todayDate, toDateString } from '../utils/date'
import { normalizeFoodPhrase } from '../utils/nutrition'
import { rankFoodMatches, scoreCorpusFood, scoreCuratedFood } from '../utils/foodSearch'
import type {
  Meal,
  MealItem,
  FoodItem,
  NutritionTarget,
  MacroSummary,
  CreateMealInput,
  Macros,
  QuestionChoice,
  FoodSearchResult,
  NutritionFeedbackInput,
} from '../types/nutrition'

type Supabase = SupabaseClient<Database>
type MealInsert = Database['public']['Tables']['meals']['Insert']
type MealUpdate = Database['public']['Tables']['meals']['Update']
type FoodItemInsert = Database['public']['Tables']['food_items']['Insert']
interface CorpusSearchRow {
  fdc_id: string
  description: string
  kcal: number
  dataset: string
  measure_grams: number[] | null
}
interface MealTotals {
  total_calories: number
  total_protein: number
  total_carbs: number
  total_fat: number
  total_fiber: number
}

export async function getMealsByDate(
  supabase: Supabase,
  userId: string,
  date: string,
): Promise<Meal[]> {
  const { data, error } = await supabase
    .from('meals')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .order('created_at')

  if (error) throw error
  return data as unknown as Meal[]
}

/**
 * Kalemsiz öğün 0 kcal olarak kaydedilir ve kullanıcı öğünü girdiğini sanır.
 * Eski mobil sürüm bu yoldan 12 boş öğün yazdı; DB'de de meals_items_not_empty
 * kısıtı var, bu kontrol aynı hatayı ağa gitmeden ve okunur bir mesajla yakalar.
 */
export class EmptyMealError extends Error {
  constructor() {
    super('Öğünde kaydedilecek yiyecek yok.')
    this.name = 'EmptyMealError'
  }
}

export async function createMeal(
  supabase: Supabase,
  userId: string,
  input: CreateMealInput,
): Promise<Meal> {
  const items = input.items ?? []
  if (items.length === 0) throw new EmptyMealError()
  const totals = calculateTotals(items)
  const serializedItems = items.map((item) => ({ ...item })) as unknown as import('../types/database').Json
  const resolvedDate = input.date ?? todayDate()
  const payload: MealInsert = {
    user_id: userId,
    meal_type: input.meal_type,
    raw_input: input.raw_input ?? null,
    items: serializedItems,
    notes: input.notes ?? null,
    ...totals,
  }
  if (resolvedDate) payload.date = resolvedDate

  if (input.parse_trace) {
    payload.parse_trace = input.parse_trace as unknown as import('../types/database').Json
  }
  if (input.parse_version) {
    payload.parse_version = input.parse_version
  }

  const { data, error } = await supabase
    .from('meals')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return data as unknown as Meal
}

export async function updateMeal(
  supabase: Supabase,
  mealId: string,
  updates: Partial<CreateMealInput>,
): Promise<Meal> {
  const payload: MealUpdate = {}

  if (updates.date !== undefined) payload.date = updates.date
  if (updates.meal_type !== undefined) payload.meal_type = updates.meal_type
  if (updates.raw_input !== undefined) payload.raw_input = updates.raw_input
  if (updates.notes !== undefined) payload.notes = updates.notes
  if (updates.parse_trace !== undefined) {
    payload.parse_trace = updates.parse_trace as unknown as import('../types/database').Json
  }
  if (updates.parse_version !== undefined) {
    payload.parse_version = updates.parse_version
  }

  if (updates.items) {
    if (updates.items.length === 0) throw new EmptyMealError()
    const totals = calculateTotals(updates.items)
    payload.items = updates.items.map((item) => ({ ...item })) as unknown as import('../types/database').Json
    payload.total_calories = totals.total_calories
    payload.total_protein = totals.total_protein
    payload.total_carbs = totals.total_carbs
    payload.total_fat = totals.total_fat
    payload.total_fiber = totals.total_fiber
  }

  const { data, error } = await supabase
    .from('meals')
    .update(payload)
    .eq('id', mealId)
    .select()
    .single()

  if (error) throw error
  return data as unknown as Meal
}

export async function deleteMeal(supabase: Supabase, mealId: string): Promise<void> {
  const { error } = await supabase.from('meals').delete().eq('id', mealId)
  if (error) throw error
}

export async function getNutritionTarget(
  supabase: Supabase,
  userId: string,
): Promise<NutritionTarget | null> {
  const { data, error } = await supabase
    .from('nutrition_targets')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  if (!data) return null

  // DB columns use _g suffix (protein_g, carbs_g, fat_g, fiber_g)
  // but TypeScript NutritionTarget extends Macros expects (protein, carbs, fat, fiber)
  const row = data as Record<string, unknown>
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    calories: row.calories as number,
    protein: (row.protein_g ?? row.protein ?? 0) as number,
    carbs: (row.carbs_g ?? row.carbs ?? 0) as number,
    fat: (row.fat_g ?? row.fat ?? 0) as number,
    fiber: (row.fiber_g ?? row.fiber ?? 0) as number,
    is_active: row.is_active as boolean,
    workout_day_calories: (row.workout_day_calories ?? null) as number | null,
    workout_day_protein_g: (row.workout_day_protein_g ?? null) as number | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

export async function getDailySummary(
  supabase: Supabase,
  userId: string,
  date: string,
): Promise<MacroSummary> {
  const { data, error } = await supabase
    .from('meals')
    .select('total_calories, total_protein, total_carbs, total_fat, total_fiber')
    .eq('user_id', userId)
    .eq('date', date)

  if (error) throw error

  const meals = data as unknown as Array<{
    total_calories: number
    total_protein: number
    total_carbs: number
    total_fat: number
    total_fiber: number
  }>

  return {
    date,
    meal_count: meals.length,
    calories: meals.reduce((s, m) => s + m.total_calories, 0),
    protein: meals.reduce((s, m) => s + m.total_protein, 0),
    carbs: meals.reduce((s, m) => s + m.total_carbs, 0),
    fat: meals.reduce((s, m) => s + m.total_fat, 0),
    fiber: meals.reduce((s, m) => s + m.total_fiber, 0),
  }
}

/**
 * Küratörlü satırların istemci tarafı önbelleği.
 *
 * Neden hepsini çekiyoruz: tablo 255 satır (kullanıcının kendi kayıtlarıyla
 * birlikte birkaç yüz). Sunucuda `ilike` ile aday süzmek hem Türkçe katlamayı
 * (çiğ↔cig) hem alias öneklerini kaçırıyordu, hem de sıralama yapamıyordu.
 * Tamamını bir kez çekip yerelde skorlamak her iki sorunu da çözüyor ve her
 * tuş vuruşundaki ağ turunu ortadan kaldırıyor.
 */
export interface CuratedFoodMatch {
  id: string
  name: string
  name_en: string | null
  aliases: string[] | null
  serving_size: number
  serving_unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  is_verified: boolean
}

const CURATED_CACHE_TTL_MS = 5 * 60 * 1000
const CURATED_COLUMNS =
  'id, name, name_en, aliases, serving_size, serving_unit, calories, protein, carbs, fat, fiber, is_verified'

let curatedCache: { userId: string; at: number; rows: CuratedFoodMatch[] } | null = null

/** Kullanıcı yeni yiyecek kaydettiğinde önbellek bayatlar. */
export function invalidateFoodCache(): void {
  curatedCache = null
}

async function loadCuratedFoods(supabase: Supabase, userId: string): Promise<CuratedFoodMatch[]> {
  const now = Date.now()
  if (curatedCache && curatedCache.userId === userId && now - curatedCache.at < CURATED_CACHE_TTL_MS) {
    return curatedCache.rows
  }

  const { data, error } = await supabase
    .from('food_items')
    .select(CURATED_COLUMNS)
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .limit(2000)

  if (error) throw error
  const rows = (data ?? []) as unknown as CuratedFoodMatch[]
  curatedCache = { userId, at: now, rows }
  return rows
}

/**
 * Yalnızca küratörlü satırlarda sıralı arama — hızlı ekleme kutusunun kullandığı yol.
 *
 * `searchFoodChoices`'tan farkı korpusu hiç sormaması ve satırın tam makrolarını
 * döndürmesi: hızlı ekleme kutusu porsiyon başına P/K/Y gösteriyor.
 */
export async function searchCuratedFoods(
  supabase: Supabase,
  query: string,
  userId: string,
  limit = 8,
): Promise<CuratedFoodMatch[]> {
  const raw = query.trim()
  if (raw.length < 2) return []

  const rows = await loadCuratedFoods(supabase, userId)
  const scored = rows
    .map((food) => ({ item: food, score: scoreCuratedFood(raw, food, food.is_verified), label: food.name }))
    .filter((entry) => entry.score > 0)

  return rankFoodMatches(scored, limit)
}

/**
 * Elle ekleme akışının arama katmanı: küratörlü `food_items` ve küratörsüz
 * `food_corpus` satırlarını tek kapalı listede birleştirir.
 *
 * Model çağrısı yok — ücretsiz kullanıcı da bu yolla öğün ekleyebilir. Besin
 * değeri yine seçilen satırdan hesaplanır (`buildItemFromChoice`); bu fonksiyon
 * sadece hangi satırların seçilebilir olduğunu döndürür.
 *
 * Sıralama `utils/foodSearch.ts` içinde; oradaki başlık yorumunda "bal" arayınca
 * çiğköftenin nasıl çıktığı ve neden çıkmaması gerektiği anlatılıyor.
 */
export async function searchFoodChoices(
  supabase: Supabase,
  query: string,
  userId: string,
  limit = 20,
): Promise<FoodSearchResult[]> {
  const raw = query.trim()
  if (raw.length < 2) return []
  const normalized = normalizeFoodPhrase(raw)
  if (normalized.length < 2) return []

  const scored: Array<{ item: FoodSearchResult; score: number; label: string }> = []

  const [curated, corpus] = await Promise.all([
    loadCuratedFoods(supabase, userId),
    // Korpus 14.5k satır; burada aday üretimi sunucuda kalmalı. RPC trigram
    // kullanıyor, dolayısıyla yazım hatasını da tolere ediyor.
    supabase.rpc('search_food_corpus', { q: normalized, lim: 30 }),
  ])

  for (const food of curated) {
    const score = scoreCuratedFood(raw, food, food.is_verified)
    if (score <= 0) continue
    scored.push({
      score,
      label: food.name,
      item: {
        id: food.id,
        source: 'curated',
        label: food.name,
        // food_items değerleri porsiyon başına tutulur; 100 g'a normalize ediyoruz.
        kcal_per_100g:
          food.serving_size > 0
            ? Math.round((food.calories / food.serving_size) * 100)
            : Math.round(food.calories),
        default_grams: food.serving_size > 0 ? food.serving_size : 100,
        verified: food.is_verified,
      },
    })
  }

  for (const row of (corpus.data ?? []) as unknown as CorpusSearchRow[]) {
    const score = scoreCorpusFood(raw, row.description, row.dataset)
    if (score <= 0) continue
    const measure = row.measure_grams?.find((g) => g > 0)
    scored.push({
      score,
      label: row.description,
      item: {
        id: row.fdc_id,
        source: 'corpus',
        label: row.description,
        kcal_per_100g: Math.round(row.kcal),
        default_grams: measure && measure > 0 ? measure : 100,
        dataset: row.dataset,
      },
    })
  }

  return rankFoodMatches(scored, limit)
}

export async function createFoodItem(
  supabase: Supabase,
  userId: string,
  item: Omit<FoodItem, 'id' | 'user_id' | 'is_verified' | 'created_at'>,
): Promise<FoodItem> {
  const payload: FoodItemInsert = { ...item, user_id: userId, is_verified: false }
  const { data, error } = await supabase
    .from('food_items')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  invalidateFoodCache()
  return data as unknown as FoodItem
}

export async function getWeeklyNutritionSummary(
  supabase: Supabase,
  userId: string,
  startDate: string,
): Promise<MacroSummary[]> {
  const [y, m, d] = startDate.split('-').map(Number) as [number, number, number]
  const endDate = toDateString(new Date(y, m - 1, d + 6))

  const { data, error } = await supabase
    .from('meals')
    .select('date, total_calories, total_protein, total_carbs, total_fat, total_fiber')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)

  if (error) throw error

  // Güne göre grupla
  const byDate = new Map<string, MacroSummary>()
  for (const meal of data as unknown as Array<{
    date: string
    total_calories: number
    total_protein: number
    total_carbs: number
    total_fat: number
    total_fiber: number
  }>) {
    const existing = byDate.get(meal.date) ?? {
      date: meal.date,
      meal_count: 0,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
    }
    byDate.set(meal.date, {
      date: meal.date,
      meal_count: existing.meal_count + 1,
      calories: existing.calories + meal.total_calories,
      protein: existing.protein + meal.total_protein,
      carbs: existing.carbs + meal.total_carbs,
      fat: existing.fat + meal.total_fat,
      fiber: existing.fiber + meal.total_fiber,
    })
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}

// Internal helper
function calculateTotals(
  items: Array<{ calories: number; protein: number; carbs: number; fat: number; fiber: number }>,
): MealTotals {
  return {
    total_calories: items.reduce((s, i) => s + i.calories, 0),
    total_protein: items.reduce((s, i) => s + i.protein, 0),
    total_carbs: items.reduce((s, i) => s + i.carbs, 0),
    total_fat: items.reduce((s, i) => s + i.fat, 0),
    total_fiber: items.reduce((s, i) => s + i.fiber, 0),
  }
}

// ============================
// Çözümleme düzeltmeleri (migration 032)
// ============================
//
// Kullanıcının düzelttiği kimlik ve onayladığı gramaj kalıcı hâle gelir; aynı
// ifade bir daha ne modele sorulur ne de kullanıcıya. Merdivenin 1. ve 3.
// basamakları bu iki tablodan besleniyor.

/** Kullanıcının seçtiği eşleşmeyi kalıcı alias'a çevirir (rung: user_alias). */
export async function saveFoodAlias(
  supabase: Supabase,
  userId: string,
  phrase: string,
  target: { food_item_id?: string; corpus_fdc_id?: string },
): Promise<void> {
  const key = normalizeFoodPhrase(phrase)
  if (!key) return

  const { error } = await supabase
    .from('food_aliases')
    .upsert(
      {
        user_id: userId,
        phrase: key,
        food_item_id: target.food_item_id ?? null,
        corpus_fdc_id: target.corpus_fdc_id ?? null,
      },
      { onConflict: 'user_id,phrase' },
    )

  if (error) throw error
}

/** Elle girilen gramajı bu kullanıcının o ifade için alışkanlığı olarak saklar. */
export async function savePortionMemory(
  supabase: Supabase,
  userId: string,
  phrase: string,
  grams: number,
): Promise<void> {
  const key = normalizeFoodPhrase(phrase)
  if (!key || !(grams > 0)) return

  const { error } = await supabase
    .from('portion_memory')
    .upsert(
      { user_id: userId, phrase: key, grams, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,phrase' },
    )

  if (error) throw error
}

/**
 * Kullanıcının kapalı listeden seçtiği satırı öğün kalemine çevirir.
 * Besin değeri yine veritabanı satırından hesaplanır — seçim sadece hangi satır
 * olduğunu belirler.
 */
export async function buildItemFromChoice(
  supabase: Supabase,
  choice: QuestionChoice,
  grams?: number,
): Promise<MealItem> {
  const USER_SET_TOLERANCE = 0.05
  const SERVING_DEFAULT_TOLERANCE = 0.3
  const hasUserGrams = grams !== undefined && grams > 0
  const tolerance = hasUserGrams ? USER_SET_TOLERANCE : SERVING_DEFAULT_TOLERANCE

  if (choice.source === 'curated') {
    const { data, error } = await supabase
      .from('food_items')
      .select('*')
      .eq('id', choice.id)
      .single()
    if (error) throw error

    const food = data as unknown as FoodItem
    const size = food.serving_size > 0 ? food.serving_size : 100
    const g = hasUserGrams ? grams : size
    const factor = g / size

    return {
      name: food.name,
      amount: Math.round(g),
      unit: food.serving_unit === 'ml' ? 'ml' : 'g',
      calories: Math.round(food.calories * factor),
      protein: Math.round(food.protein * factor * 10) / 10,
      carbs: Math.round(food.carbs * factor * 10) / 10,
      fat: Math.round(food.fat * factor * 10) / 10,
      fiber: Math.round(food.fiber * factor * 10) / 10,
      food_item_id: food.id,
      grams: Math.round(g * 10) / 10,
      calories_min: Math.round(food.calories * factor * (1 - tolerance)),
      calories_max: Math.round(food.calories * factor * (1 + tolerance)),
      source: 'curated',
      resolve_rung: 'user_alias',
      portion_rung: hasUserGrams ? 'user_memory' : 'serving_default',
      portion_tolerance: tolerance,
      confidence: 0.95,
      disposition: 'auto',
    }
  }

  const { data, error } = await supabase
    .from('food_corpus')
    .select('fdc_id, description, kcal, protein, carbs, fat, fiber, measure_grams')
    .eq('fdc_id', choice.id)
    .single()
  if (error) throw error

  const row = data as unknown as {
    fdc_id: string
    description: string
    kcal: number
    protein: number
    carbs: number
    fat: number
    fiber: number
    measure_grams: number[] | null
  }
  const fallback = row.measure_grams?.[0] && row.measure_grams[0] > 0 ? row.measure_grams[0] : 100
  const g = hasUserGrams ? grams : fallback
  const factor = g / 100

  return {
    name: row.description,
    amount: Math.round(g),
    unit: 'g',
    calories: Math.round(row.kcal * factor),
    protein: Math.round(row.protein * factor * 10) / 10,
    carbs: Math.round(row.carbs * factor * 10) / 10,
    fat: Math.round(row.fat * factor * 10) / 10,
    fiber: Math.round(row.fiber * factor * 10) / 10,
    corpus_fdc_id: row.fdc_id,
    grams: Math.round(g * 10) / 10,
    calories_min: Math.round(row.kcal * factor * (1 - tolerance)),
    calories_max: Math.round(row.kcal * factor * (1 + tolerance)),
    source: 'corpus',
    resolve_rung: 'user_alias',
    portion_rung: hasUserGrams ? 'user_memory' : 'serving_default',
    portion_tolerance: tolerance,
    confidence: 0.95,
    disposition: 'auto',
  }
}

/**
 * "Bu yanlış" bildirimini küratörlük kuyruğuna yazar.
 *
 * Bildirim anındaki etiket, gramaj, kalori ve iz birlikte dondurulur: sözlük
 * sonradan düzeltilse bile neyin şikâyet edildiği okunabilir kalmalı. Sonuç
 * kullanıcıya gösterilen akışı bloklamaz — çağıran taraf hatayı yutabilir.
 */
export async function submitNutritionFeedback(
  supabase: Supabase,
  userId: string,
  input: NutritionFeedbackInput,
): Promise<void> {
  const phrase = input.phrase.trim()
  if (!phrase) return

  const { error } = await supabase.from('nutrition_feedback').insert({
    user_id: userId,
    meal_id: input.meal_id ?? null,
    raw_input: input.raw_input ?? null,
    phrase,
    item_label: input.item_label ?? null,
    item_source: input.item_source ?? null,
    item_ref_id: input.item_ref_id ?? null,
    item_grams: input.item_grams ?? null,
    item_kcal: input.item_kcal ?? null,
    kind: input.kind,
    note: input.note?.trim() || null,
    expected_kcal: input.expected_kcal ?? null,
    expected_grams: input.expected_grams ?? null,
    parse_version: input.parse_version ?? null,
    trace: (input.trace ?? null) as never,
  })

  if (error) throw error
}
