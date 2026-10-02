// supabase/functions/ai-suggest/nutrition.ts
// Beslenme koçu sohbeti (nutrition_chat) ve istemciden gelen makro ile öğün verisinin normalleştirilmesi.

import { buildNutritionCoachPrompt, parseNutritionCoachResult, type Macros } from '../_shared/ai/coach.ts'
import { CHAT_EFFORT, firstText } from './model.ts'
import { normalizeHistory, type RouteContext } from './request.ts'
import { shiftDate } from './time.ts'

function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Tüketilen makro nesnesi de iki biçimde geliyor: yeni istemciler
 * `{calories, protein, ...}`, eski mobil sürüm `{cal, prot, carbs, fat}`.
 */
function normalizeMacros(raw: unknown, fallback: Macros): Macros {
  if (!raw || typeof raw !== 'object') return fallback
  const r = raw as Record<string, unknown>
  const pick = (...keys: string[]): number | null => {
    for (const key of keys) {
      if (r[key] !== undefined && r[key] !== null) return num(r[key])
    }
    return null
  }
  return {
    calories: pick('calories', 'cal', 'kcal') ?? fallback.calories,
    protein: pick('protein', 'prot', 'protein_g') ?? fallback.protein,
    carbs: pick('carbs', 'carbs_g', 'carbohydrates') ?? fallback.carbs,
    fat: pick('fat', 'fat_g') ?? fallback.fat,
    fiber: pick('fiber', 'fiber_g') ?? fallback.fiber,
  }
}

interface MealSummary {
  meal_type: string
  items: { name: string; amount: number; unit: string; calories: number }[]
}

function normalizeMeals(raw: unknown): MealSummary[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry): MealSummary[] => {
    if (!entry || typeof entry !== 'object') return []
    const record = entry as Record<string, unknown>
    const items = Array.isArray(record['items'])
      ? record['items'].flatMap((rawItem): MealSummary['items'] => {
          if (!rawItem || typeof rawItem !== 'object') return []
          const item = rawItem as Record<string, unknown>
          const name = typeof item['name'] === 'string' ? item['name'] : ''
          if (!name) return []
          return [{
            name,
            amount: num(item['amount']),
            unit: typeof item['unit'] === 'string' ? item['unit'] : 'g',
            calories: num(item['calories']),
          }]
        })
      : []
    return [{
      meal_type: typeof record['meal_type'] === 'string' ? record['meal_type'] : 'snack',
      items,
    }]
  })
}

export async function handleNutritionChat(route: RouteContext): Promise<Response> {
  const { supabase, userId, body, client, chatModel, ledger, lang, today, json } = route
  const { user_message, current_time, nutrition_context } = body

  const ctx = nutrition_context ?? {}
  const targetRaw = ctx.target ?? body.target
  const consumedRaw = ctx.consumed ?? body.consumed
  const mealsRaw = ctx.meals_today ?? body.meals_today

  // Hedef istemciden gelmediyse veritabanından oku: eski mobil sürüm
  // hedefi hiç göndermiyordu ve koç varsayılan sayılarla konuşuyordu.
  let target: Macros = { calories: 2000, protein: 150, carbs: 250, fat: 70, fiber: 25 }
  if (targetRaw) {
    target = normalizeMacros(targetRaw, target)
  } else {
    const { data: targetRow } = await supabase
      .from('nutrition_targets')
      .select('calories, protein_g, carbs_g, fat_g, fiber_g')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle()
    if (targetRow) {
      target = {
        calories: num(targetRow.calories, target.calories),
        protein: num(targetRow.protein_g, target.protein),
        carbs: num(targetRow.carbs_g, target.carbs),
        fat: num(targetRow.fat_g, target.fat),
        fiber: num(targetRow.fiber_g, target.fiber),
      }
    }
  }

  const consumed = normalizeMacros(consumedRaw, { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 })

  // Haftalık trend sunucuda hesaplanır: istemcinin elinde yalnızca bugünün
  // özeti var, geçmişi göndertmek her sohbet turunda fazladan sorgu demek.
  const { data: weekRows } = await supabase
    .from('meals')
    .select('date, total_calories, total_protein, total_carbs, total_fat, total_fiber')
    .eq('user_id', userId)
    .gte('date', shiftDate(today, -6))
    .lte('date', today)

  const byDate = new Map<string, Macros>()
  for (const row of weekRows ?? []) {
    const key = row.date as string
    const acc = byDate.get(key) ?? { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    byDate.set(key, {
      calories: acc.calories + num(row.total_calories),
      protein: acc.protein + num(row.total_protein),
      carbs: acc.carbs + num(row.total_carbs),
      fat: acc.fat + num(row.total_fat),
      fiber: acc.fiber + num(row.total_fiber),
    })
  }
  const days = [...byDate.values()]
  const weeklyAverage: Macros | null = days.length > 0
    ? {
        calories: days.reduce((s, d) => s + d.calories, 0) / days.length,
        protein: days.reduce((s, d) => s + d.protein, 0) / days.length,
        carbs: days.reduce((s, d) => s + d.carbs, 0) / days.length,
        fat: days.reduce((s, d) => s + d.fat, 0) / days.length,
        fiber: days.reduce((s, d) => s + d.fiber, 0) / days.length,
      }
    : null

  const { system, messages } = buildNutritionCoachPrompt({
    lang,
    target,
    consumed,
    mealsToday: normalizeMeals(mealsRaw),
    weeklyAverage,
    weeklyDaysLogged: days.length,
    localTime: current_time ?? '—',
    history: normalizeHistory(ctx.history ?? body.history),
    userMessage: user_message?.trim() || 'Ne yiyebilirim?',
  })

  const response = await client.messages.create({
    model: chatModel,
    output_config: CHAT_EFFORT,
    // Dusunme (effort low) ayni butceyi paylasiyor: eski deger dusunme
    // yokken olculmustu, simdi ciktinin yarim kalmamasi icin pay birakiyoruz.
    max_tokens: 4500,
    system,
    messages,
  })
  await ledger.record(response)

  const result = parseNutritionCoachResult(firstText(response))
  if (!result.message) {
    result.message = 'Yanıt oluşturulamadı, tekrar dene.'
  }
  return json(result)
}
