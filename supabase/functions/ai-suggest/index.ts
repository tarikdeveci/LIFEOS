// supabase/functions/ai-suggest/index.ts
// Claude AI ile görev önceliklendirme, planlama ve koç sohbetleri
// Client'tan çağrılır (auth header ile)
//
// Prompt'lar ve yanıt ayrıştırma _shared/ai/coach.ts içinde. Buradaki iş:
// yetkilendirme, veritabanından bağlam toplama, modele gitme, yanıtı döndürme.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.2'
import Anthropic from 'npm:@anthropic-ai/sdk'
import {
  buildNutritionCoachPrompt,
  buildPlannerPrompt,
  buildWorkoutCoachPrompt,
  parseNutritionCoachResult,
  parsePlannerResult,
  parseWorkoutCoachResult,
  type ChatTurn,
  type Lang,
  type Macros,
  type PlannerTask,
  type WorkoutCatalogEntry,
} from '../_shared/ai/coach.ts'

const CHAT_MODEL = 'claude-opus-4-6'

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://lifeos.tr',
  'https://www.lifeos.tr',
]

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]!
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Credentials': 'true',
  }
}

/**
 * Yayındaki istemciler iki farklı geçmiş biçimi gönderiyor: web `{role, text}`,
 * App Store'daki mobil sürüm `{role, content}`. İkisini de kabul ediyoruz —
 * biçimi tek tarafa zorlamak eski sürümlerde sohbet hafızasını siler.
 */
function normalizeHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry): ChatTurn[] => {
    if (!entry || typeof entry !== 'object') return []
    const record = entry as Record<string, unknown>
    const text = typeof record['text'] === 'string'
      ? record['text']
      : typeof record['content'] === 'string' ? record['content'] : ''
    if (!text.trim()) return []
    return [{ role: record['role'] === 'assistant' ? 'assistant' : 'user', text }]
  })
}

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

interface SuggestRequest {
  type: 'daily_plan' | 'task_priority' | 'workout_plan' | 'workout_program_chat' | 'replan' | 'nutrition_chat'
  language?: Lang
  date?: string
  /**
   * İstemcinin YEREL bugün tarihi (YYYY-MM-DD). Sunucu UTC'de çalıştığı için
   * toISOString() burada yanlış gün verir: UTC+3'te gece 00:00–03:00 arası
   * bir önceki günü döndürür, bu da "hedef gün bugün mü" testini bozup
   * planlamayı geçmiş saatlerden başlatır. İstemci göndermezse UTC'ye düşeriz.
   */
  today?: string
  task_id?: string
  fitness_goal?: string
  available_minutes?: number
  recent_workouts?: { date: string; name: string; muscle_groups: string[] }[]
  energy_level?: number
  buffer_minutes?: number
  existing_blocks?: { id?: string; start: string; end: string; label: string }[]
  user_message?: string
  current_time?: string
  history?: unknown
  // nutrition_chat — yeni istemciler nutrition_context, eskiler düz alanlar gönderir
  nutrition_context?: {
    target?: unknown
    consumed?: unknown
    meals_today?: unknown
    history?: unknown
  }
  target?: unknown
  consumed?: unknown
  meals_today?: unknown
  workout_context?: {
    available_exercises?: WorkoutCatalogEntry[]
    history?: unknown
  }
}

async function isProUser(supabase: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('subscriptions')
    .select('status, current_period_end')
    .eq('user_id', userId)
    .maybeSingle()

  const active = data?.status === 'pro_monthly' || data?.status === 'pro_annual'
  const periodEnd = typeof data?.current_period_end === 'string' ? data.current_period_end : null
  const notExpired = periodEnd !== null && new Date(periodEnd) > new Date()

  return active && notExpired
}

function normalizeExerciseName(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Modelden gelen ilk text bloğunun metni; yoksa boş string. */
function firstText(response: { content: Array<{ type: string; text?: string }> }): string {
  const block = response.content.find((b) => b.type === 'text')
  return block?.type === 'text' && typeof block.text === 'string' ? block.text : ''
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().split('T')[0]!
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth token'dan kullanıcı ID'si al
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return json({ error: 'Unauthorized' }, 401)

    const body: SuggestRequest = await req.json()
    const {
      type, language, date, today: clientToday, task_id, fitness_goal, available_minutes,
      energy_level, buffer_minutes, existing_blocks, user_message, current_time,
      nutrition_context, workout_context,
    } = body

    const allowed = await isProUser(supabase, user.id)
    if (!allowed) return json({ error: 'AI access requires Pro' }, 402)

    const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })
    const lang: Lang = language === 'en' ? 'en' : 'tr'
    const langInstr = lang === 'en' ? 'Respond in English.' : 'Türkçe yanıt ver.'
    const today = clientToday ?? new Date().toISOString().split('T')[0]!

    if (type === 'daily_plan') {
      // Günlük plan önerileri
      const targetDate = date ?? today

      // Bugüne atanmış görevleri al
      const { data: tasks } = await supabase
        .from('tasks')
        .select('title, status, value_score, urgency_score, risk_score, effort_score, friction_score, priority_score, estimated_minutes, tags')
        .eq('scheduled_date', targetDate)
        .not('status', 'in', '(done,deferred)')
        .order('priority_score', { ascending: false })

      // Dünden taşan görevler
      const { data: carryover } = await supabase
        .from('tasks')
        .select('title, priority_score, scheduled_date')
        .lt('scheduled_date', targetDate)
        .not('status', 'in', '(done,deferred)')
        .order('priority_score', { ascending: false })
        .limit(5)

      // Enerji seviyesi
      const { data: plan } = await supabase
        .from('daily_plans')
        .select('energy_level')
        .eq('date', targetDate)
        .single()

      const taskSummary =
        tasks
          ?.map(
            (t) =>
              `- ${t.title} (öncelik: ${t.priority_score}, efor: ${t.effort_score}, süre: ${t.estimated_minutes ?? '?'}dk)`,
          )
          .join('\n') ?? 'Görev yok'

      const carryoverSummary =
        carryover?.length
          ? carryover.map((t) => `- ${t.title} (${t.scheduled_date}'den taşıyor)`).join('\n')
          : 'Taşan görev yok'

      const existingBlocksSummary = existing_blocks?.length
        ? existing_blocks.map((b) => `  ${b.start}–${b.end}: ${b.label}`).join('\n')
        : '  (Blok yok)'
      const bufferNote = buffer_minutes && buffer_minutes > 0 ? `Görevler arasına ${buffer_minutes} dakika buffer ekle.` : ''

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: `Sen LifeOS kişisel yaşam asistanısın. Kullanıcının günlük planlamasına yardımcı oluyorsun.
${langInstr} Kısa ve net öneriler sun. Emoji kullan.
Yanıtını SADECE şu JSON formatında ver:
[{"type": "task_order"|"break"|"focus_block"|"general", "message": "öneri metni", "task_id": "varsa ilgili task ID", "suggested_start": "HH:MM veya null", "suggested_end": "HH:MM veya null", "block_type": "task"|"break"|"focus"|"routine"|"meal"|"workout" veya null}]
Mola ve odak blokları için mutlaka suggested_start ve suggested_end ver. Görev sıralaması için null bırak.`,
        messages: [
          {
            role: 'user',
            content: `Bugünün planı için öneriler ver.

Enerji seviyesi: ${plan?.energy_level ?? 'belirtilmemiş'}/5
${bufferNote}

Mevcut zaman blokları:
${existingBlocksSummary}

Bugünün görevleri:
${taskSummary}

Dünden taşan görevler:
${carryoverSummary}

Lütfen şunları öner:
1. Görev sıralaması
2. Mola zamanları (kesin saat ver: ör. 10:30–11:00)
3. Odak blokları (kesin saat ver: ör. 14:00–16:00)
4. Genel öneri

Mevcut bloklara çakışma olmasın. Çalışma saatleri 08:00–22:00.`,
          },
        ],
      })

      const text = firstText(response)
      let suggestions: unknown[] = []
      try {
        const jsonMatch = text.match(/\[[\s\S]*\]/)
        if (jsonMatch) suggestions = JSON.parse(jsonMatch[0])
      } catch {
        suggestions = [{ type: 'general', message: text }]
      }

      return json({ suggestions })
    }

    if (type === 'task_priority' && task_id) {
      // Tek görev için WSJF skoru önerisi
      const { data: task } = await supabase
        .from('tasks')
        .select('title, description, tags, due_date')
        .eq('id', task_id)
        .single()

      if (!task) return json({ error: 'Görev bulunamadı' }, 404)

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        system: `Sen bir görev önceliklendirme asistanısın. WSJF (Weighted Shortest Job First) metodunu kullanıyorsun.
Parametreler (1-5 arası):
- value_score: İş/kullanıcı değeri
- urgency_score: Zaman hassasiyeti
- risk_score: Risk azaltma / fırsat
- effort_score: Tahmini efor
- friction_score: Yapılmasının önündeki engel

Sadece JSON döndür:
{"value_score": N, "urgency_score": N, "risk_score": N, "effort_score": N, "friction_score": N, "reasoning": "${lang === 'en' ? 'Short explanation' : 'Kısa açıklama'}"}`,
        messages: [
          {
            role: 'user',
            content: `Bu görev için WSJF skorları öner:
Başlık: ${task.title}
Açıklama: ${task.description ?? 'Yok'}
Etiketler: ${task.tags?.join(', ') ?? 'Yok'}
Son tarih: ${task.due_date ?? 'Yok'}`,
          },
        ],
      })

      const text = firstText(response)
      let suggestion: unknown = {}
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) suggestion = JSON.parse(jsonMatch[0])
      } catch {
        suggestion = { reasoning: text }
      }

      return json({ suggestion })
    }

    if (type === 'workout_plan') {
      // Bugün için antrenman planı önerileri
      const { data: recentWorkoutData } = await supabase
        .from('workouts')
        .select('date, name, status, workout_sets(exercise:exercises(name, muscle_group:muscle_groups(name)))')
        .eq('user_id', user.id)
        .gte('date', shiftDate(today, -7))
        .order('date', { ascending: false })
        .limit(7)

      const recentSummary = recentWorkoutData
        ?.filter((w) => w.status === 'completed')
        .map((w) => {
          const muscles = [...new Set(
            (w.workout_sets as { exercise: { muscle_group: { name: string } | null } | null }[])
              ?.flatMap((s) => s?.exercise?.muscle_group?.name ?? []) ?? []
          )]
          return `${w.date}: ${w.name ?? 'Antrenman'} (${muscles.join(', ') || 'bilinmiyor'})`
        })
        .join('\n') ?? 'Geçmiş antrenman yok'

      const response = await client.messages.create({
        model: CHAT_MODEL,
        max_tokens: 1500,
        system: `Sen LifeOS'un kişisel fitness koçusun. ${langInstr}
Kullanıcının antrenman geçmişine göre bugün ne yapması gerektiğini öneri olarak sun.
Yanıtını şu JSON dizisi formatında ver — her öneri bir nesne:
[{"type": "exercise_suggestion"|"rest"|"progression"|"general", "message": "öneri metni", "exercise_id": null}]
Öneride şunlara dikkat et:
1. Kas gruplarını dengeli çalıştır (arka arkaya aynı kas grubu olmasın)
2. Dinlenme günü gerekiyorsa rest öner
3. İlerleme (progression): ağırlık / tekrar artışı öner
4. Mevcut enerji seviyesine göre yoğunluk ayarla`,
        messages: [{
          role: 'user',
          content: `Bugün için antrenman önerileri ver.

Hedef: ${fitness_goal ?? 'genel fitness'}
Süre: ${available_minutes ?? 60} dakika
Enerji seviyesi: ${energy_level ?? 3}/5

Son 7 günün antrenmanları:
${recentSummary}

Lütfen:
1. Bugün hangi kas grubunu çalışmalı?
2. Hangi egzersizleri yapmalı? (3-5 egzersiz)
3. Kaç set/tekrar?
4. Gerekiyorsa dinlenme günü öner`,
        }],
      })

      const text = firstText(response)
      let suggestions: unknown[] = []
      try {
        const jsonMatch = text.match(/\[[\s\S]*\]/)
        if (jsonMatch) suggestions = JSON.parse(jsonMatch[0])
      } catch {
        suggestions = [{ type: 'general', message: text }]
      }

      return json({ suggestions })
    }

    if (type === 'workout_program_chat') {
      // Katalog sunucudan okunur: istemciye güvenip 200 satır göndertmek hem
      // isteği şişiriyor hem de eski sürümlerde eksik alan bırakıyordu.
      const { data: catalogRows } = await supabase
        .from('exercises')
        .select('name, category, is_bodyweight, muscle_group:muscle_groups(name)')
        .order('name', { ascending: true })

      const catalog: WorkoutCatalogEntry[] = catalogRows?.length
        ? catalogRows.map((row) => ({
            name: row.name as string,
            category: (row.category as string | null) ?? undefined,
            muscle_group: (row.muscle_group as { name: string } | null)?.name ?? undefined,
            is_bodyweight: (row.is_bodyweight as boolean | null) ?? false,
          }))
        : (workout_context?.available_exercises ?? [])

      if (catalog.length === 0) {
        return json({
          message: 'Egzersiz kütüphanesi henüz hazır değil. Kütüphane yüklenince tekrar dene.',
          program: null,
        })
      }

      const catalogByNormalized = new Map(catalog.map((e) => [normalizeExerciseName(e.name), e.name]))
      const resolveName = (requested: string): string | null => {
        const key = normalizeExerciseName(requested)
        const exact = catalogByNormalized.get(key)
        if (exact) return exact
        // Model "Barbell Squat" derken katalogda "Squat" olabilir; tek yönlü
        // kapsama yeterince güvenli çünkü kısa isim uzunun içinde geçiyor.
        for (const [candidate, original] of catalogByNormalized) {
          if (candidate.includes(key) || key.includes(candidate)) return original
        }
        return null
      }

      const { data: recentRows } = await supabase
        .from('workouts')
        .select('date, name, status, workout_sets(exercise:exercises(muscle_group:muscle_groups(name)))')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .gte('date', shiftDate(today, -14))
        .order('date', { ascending: false })
        .limit(10)

      const recentWorkouts = (recentRows ?? []).map((w) => ({
        date: w.date as string,
        name: (w.name as string | null) ?? 'Antrenman',
        muscle_groups: [...new Set(
          (w.workout_sets as { exercise: { muscle_group: { name: string } | null } | null }[] | null)
            ?.flatMap((s) => s?.exercise?.muscle_group?.name ?? []) ?? [],
        )],
      }))

      const { data: programRows } = await supabase
        .from('workout_programs')
        .select('name')
        .eq('user_id', user.id)
        .limit(10)

      const { system, messages } = buildWorkoutCoachPrompt({
        lang,
        catalog,
        recentWorkouts,
        existingProgramNames: (programRows ?? []).map((p) => p.name as string),
        history: normalizeHistory(workout_context?.history ?? body.history),
        userMessage: user_message?.trim() || 'Bana haftalık bir antrenman programı yaz.',
      })

      const response = await client.messages.create({
        model: CHAT_MODEL,
        max_tokens: 3000,
        system,
        messages,
      })

      const result = parseWorkoutCoachResult(firstText(response), resolveName)
      if (!result.message) {
        result.message = 'Yanıt oluşturulamadı, isteğini biraz daha netleştirip tekrar dene.'
      }
      return json(result)
    }

    if (type === 'replan') {
      const targetDate = date ?? today
      const now = current_time ?? new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false })
      const planningCutoff = targetDate === today ? now : '00:00'

      const { data: scheduledRows } = await supabase
        .from('tasks')
        .select('id, title, estimated_minutes, priority_score, scheduled_date')
        .eq('user_id', user.id)
        .eq('scheduled_date', targetDate)
        .not('status', 'in', '(done,deferred)')
        .order('priority_score', { ascending: false })
        .limit(20)

      // Bekleyen görevler: koç boşluk gördüğünde buradan çekebilsin diye.
      // Eskiden yalnızca güne atanmış görevler veriliyordu ve "günümü doldur"
      // isteğinde ekleyecek bir şey bulamıyordu.
      const { data: backlogRows } = await supabase
        .from('tasks')
        .select('id, title, estimated_minutes, priority_score, scheduled_date')
        .eq('user_id', user.id)
        .is('scheduled_date', null)
        .not('status', 'in', '(done,deferred)')
        .order('priority_score', { ascending: false })
        .limit(10)

      const toPlannerTask = (row: Record<string, unknown>): PlannerTask => ({
        id: row['id'] as string,
        title: row['title'] as string,
        estimated_minutes: (row['estimated_minutes'] as number | null) ?? null,
        priority_score: (row['priority_score'] as number | null) ?? null,
        scheduled_date: (row['scheduled_date'] as string | null) ?? null,
      })

      const { data: planRow } = await supabase
        .from('daily_plans')
        .select('energy_level')
        .eq('user_id', user.id)
        .eq('date', targetDate)
        .maybeSingle()

      const blocks = existing_blocks ?? []
      const { system, messages } = buildPlannerPrompt({
        lang,
        targetDate,
        today,
        now,
        planningCutoff,
        energyLevel: (planRow?.energy_level as number | null) ?? energy_level ?? null,
        bufferMinutes: buffer_minutes ?? 15,
        pastBlocks: blocks.filter((b) => b.end <= planningCutoff),
        futureBlocks: blocks.filter((b) => b.end > planningCutoff),
        scheduledTasks: (scheduledRows ?? []).map(toPlannerTask),
        backlogTasks: (backlogRows ?? []).map(toPlannerTask),
        history: normalizeHistory(body.history),
        userMessage: user_message?.trim() || 'Günümü planla',
      })

      const response = await client.messages.create({
        model: CHAT_MODEL,
        max_tokens: 2500,
        system,
        messages,
      })

      const knownIds = new Set(blocks.flatMap((b) => (b.id ? [b.id] : [])))
      return json(parsePlannerResult(firstText(response), knownIds))
    }

    if (type === 'nutrition_chat') {
      const ctx = nutrition_context ?? {}
      const targetRaw = ctx.target ?? body.target
      const consumedRaw = ctx.consumed ?? body.consumed
      const mealsRaw = ctx.meals_today ?? body.meals_today

      // Hedef istemciden gelmediyse veritabanından oku — eski mobil sürüm
      // hedefi hiç göndermiyordu ve koç varsayılan sayılarla konuşuyordu.
      let target: Macros = { calories: 2000, protein: 150, carbs: 250, fat: 70, fiber: 25 }
      if (targetRaw) {
        target = normalizeMacros(targetRaw, target)
      } else {
        const { data: targetRow } = await supabase
          .from('nutrition_targets')
          .select('calories, protein_g, carbs_g, fat_g, fiber_g')
          .eq('user_id', user.id)
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
        .eq('user_id', user.id)
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
        model: CHAT_MODEL,
        max_tokens: 1500,
        system,
        messages,
      })

      const result = parseNutritionCoachResult(firstText(response))
      if (!result.message) {
        result.message = 'Yanıt oluşturulamadı, tekrar dene.'
      }
      return json(result)
    }

    return json({ error: 'Geçersiz istek tipi' }, 400)
  } catch (error) {
    console.error('ai-suggest error:', error)
    const message = error instanceof Error ? error.message : String(error)
    console.error('ai-suggest stack:', error instanceof Error ? error.stack : undefined)
    return new Response(
      JSON.stringify({ error: 'AI öneri oluşturulurken hata oluştu', detail: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
