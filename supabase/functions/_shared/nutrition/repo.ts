// Supabase destekli veri katmanı.
//
// Supabase client'ı yapısal olarak tipliyoruz (npm import yok) — böylece bu dosya
// da Node tarafından import edilebilir ve eval sahte bir repo geçebilir.
//
// Küratörlü katman tamamen belleğe çekilir (birkaç yüz satır) çünkü IDF istatistiği
// tüm sözlüğü görmek zorunda. Korpus (13k satır) ASLA çekilmez: aday üretimi SQL'de.

import type { AliasTarget, CorpusFood, CuratedFood, FoodRepo } from './types.ts'

type Row = Record<string, unknown>

interface QueryResult {
  data: Row[] | null
  error: { message: string } | null
}

interface Filterable extends PromiseLike<QueryResult> {
  or(filter: string): Filterable
  eq(column: string, value: string): Filterable
  in(column: string, values: readonly string[]): Filterable
}

interface Table {
  select(columns: string): Filterable
}

export interface SupabaseLike {
  from(table: string): Table
  rpc(name: string, args: Row): PromiseLike<QueryResult | { data: unknown; error: { message: string } | null }>
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' ? parseFloat(value) : NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

function toCurated(row: Row): CuratedFood {
  return {
    id: str(row['id']),
    name: str(row['name']),
    name_en: typeof row['name_en'] === 'string' ? row['name_en'] : null,
    aliases: Array.isArray(row['aliases']) ? (row['aliases'] as unknown[]).map((a) => str(a)) : [],
    serving_size: num(row['serving_size'], 100),
    serving_unit: str(row['serving_unit'], 'g'),
    calories: num(row['calories']),
    protein: num(row['protein']),
    carbs: num(row['carbs']),
    fat: num(row['fat']),
    fiber: num(row['fiber']),
    category: typeof row['category'] === 'string' ? row['category'] : null,
    is_countable: row['is_countable'] === true,
  }
}

function toCorpus(row: Row): CorpusFood {
  const measures = Array.isArray(row['measure_grams'])
    ? (row['measure_grams'] as unknown[]).map((g) => num(g)).filter((g) => g > 0)
    : []
  return {
    fdc_id: str(row['fdc_id']),
    description: str(row['description']),
    search_text: str(row['search_text'], str(row['description'])).toLowerCase(),
    dataset: str(row['dataset']),
    kcal: num(row['kcal']),
    protein: num(row['protein']),
    carbs: num(row['carbs']),
    fat: num(row['fat']),
    fiber: num(row['fiber']),
    measure_grams: measures,
    score: num(row['score']),
  }
}

const CURATED_COLUMNS =
  'id, name, name_en, aliases, serving_size, serving_unit, calories, protein, carbs, fat, fiber, category, is_countable'

const CORPUS_COLUMNS =
  'fdc_id, description, search_text, dataset, kcal, protein, carbs, fat, fiber, measure_grams'

export function createSupabaseFoodRepo(client: SupabaseLike, userId: string): FoodRepo {
  // Aynı istekte birden çok kalem aynı sözlüğe bakıyor: tek sefer çek, paylaş.
  let curatedCache: Promise<CuratedFood[]> | null = null
  let aliasCache: Promise<Map<string, AliasTarget>> | null = null
  let memoryCache: Promise<Map<string, number>> | null = null

  return {
    curated(): Promise<CuratedFood[]> {
      if (!curatedCache) {
        curatedCache = Promise.resolve(
          client.from('food_items').select(CURATED_COLUMNS)
            .or(`user_id.is.null,user_id.eq.${userId}`),
        ).then((result) => {
          if (result.error) throw new Error(`food_items okunamadı: ${result.error.message}`)
          return (result.data ?? []).map(toCurated).filter((food) => food.id && food.name)
        })
      }
      return curatedCache
    },

    async searchCorpus(query: string, limit: number): Promise<CorpusFood[]> {
      const result = await client.rpc('search_food_corpus', { q: query, lim: limit })
      if (result.error) {
        // Korpus katmanı olmadan hat çalışmaya devam eder — sadece daha çok soru sorar.
        console.error('search_food_corpus hatası:', result.error.message)
        return []
      }
      const rows = Array.isArray(result.data) ? (result.data as Row[]) : []
      return rows.map(toCorpus).filter((row) => row.fdc_id)
    },

    async corpusByIds(ids: string[]): Promise<CorpusFood[]> {
      if (ids.length === 0) return []
      const result = await client.from('food_corpus').select(CORPUS_COLUMNS).in('fdc_id', ids)
      if (result.error) {
        console.error('food_corpus okunamadı:', result.error.message)
        return []
      }
      return (result.data ?? []).map(toCorpus)
    },

    userAliases(): Promise<Map<string, AliasTarget>> {
      if (!aliasCache) {
        aliasCache = Promise.resolve(
          client.from('food_aliases').select('phrase, food_item_id, corpus_fdc_id')
            .eq('user_id', userId),
        ).then((result) => {
          const map = new Map<string, AliasTarget>()
          if (result.error) {
            console.error('food_aliases okunamadı:', result.error.message)
            return map
          }
          for (const row of result.data ?? []) {
            const phrase = str(row['phrase'])
            if (!phrase) continue
            const foodItemId = str(row['food_item_id'])
            const corpusId = str(row['corpus_fdc_id'])
            map.set(phrase, foodItemId ? { food_item_id: foodItemId } : { corpus_fdc_id: corpusId })
          }
          return map
        })
      }
      return aliasCache
    },

    portionMemory(): Promise<Map<string, number>> {
      if (!memoryCache) {
        memoryCache = Promise.resolve(
          client.from('portion_memory').select('phrase, grams').eq('user_id', userId),
        ).then((result) => {
          const map = new Map<string, number>()
          if (result.error) {
            console.error('portion_memory okunamadı:', result.error.message)
            return map
          }
          for (const row of result.data ?? []) {
            const phrase = str(row['phrase'])
            const grams = num(row['grams'])
            if (phrase && grams > 0) map.set(phrase, grams)
          }
          return map
        })
      }
      return memoryCache
    },

    async recordGaps(gaps: { phrase: string; reason: string }[]): Promise<void> {
      for (const gap of gaps.slice(0, 10)) {
        const result = await client.rpc('record_food_gap', {
          p_user: userId,
          p_phrase: gap.phrase,
          p_reason: gap.reason,
        })
        if (result.error) console.error('record_food_gap hatası:', result.error.message)
      }
    },
  }
}
