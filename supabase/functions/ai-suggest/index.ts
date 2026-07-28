// supabase/functions/ai-suggest/index.ts
// Claude AI ile görev önceliklendirme ve günlük plan önerileri
// Client'tan çağrılır (auth header ile)

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.2'
import Anthropic from 'npm:@anthropic-ai/sdk'

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

interface SuggestRequest {
  type: 'daily_plan' | 'task_priority' | 'workout_plan' | 'workout_program_chat' | 'replan' | 'nutrition_chat'
  language?: 'tr' | 'en'
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
  // nutrition_chat
  nutrition_context?: {
    target: { calories: number; protein: number; carbs: number; fat: number; fiber: number }
    consumed: { calories: number; protein: number; carbs: number; fat: number; fiber: number }
    meals_today: { meal_type: string; items: { name: string; amount: number; unit: string; calories: number }[] }[]
    history?: { role: 'user' | 'assistant'; text: string }[]
  }
  workout_context?: {
    available_exercises: { name: string; category?: string; muscle_group?: string; is_bodyweight?: boolean }[]
    history?: { role: 'user' | 'assistant'; text: string }[]
  }
}

interface WorkoutProgramExercise {
  exercise_name: string
  sets: number
  reps: number
  weight_kg: number
}

interface WorkoutProgramPayload {
  name: string
  description: string
  exercises: WorkoutProgramExercise[]
}

interface WorkoutProgramResult {
  message: string
  program: WorkoutProgramPayload | null
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
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth token'dan kullanıcı ID'si al
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { type, language, date, today: clientToday, task_id, fitness_goal, available_minutes, recent_workouts, energy_level, buffer_minutes, existing_blocks, user_message, current_time, nutrition_context, workout_context }: SuggestRequest = await req.json()
    const allowed = await isProUser(supabase, user.id)
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'AI access requires Pro' }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

    // Dil talimatı — tüm system prompt'lara eklenir
    const langInstr = language === 'en' ? 'Respond in English.' : 'Türkçe yanıt ver.'

    if (type === 'daily_plan') {
      // Günlük plan önerileri
      const targetDate = date ?? clientToday ?? new Date().toISOString().split('T')[0]!

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

      const textBlock = response.content.find((block) => block.type === 'text')
      let suggestions: unknown[] = []

      if (textBlock && textBlock.type === 'text') {
        try {
          const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/)
          if (jsonMatch) {
            suggestions = JSON.parse(jsonMatch[0])
          }
        } catch {
          suggestions = [{ type: 'general', message: textBlock.text }]
        }
      }

      return new Response(JSON.stringify({ suggestions }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } else if (type === 'task_priority' && task_id) {
      // Tek görev için WSJF skoru önerisi
      const { data: task } = await supabase
        .from('tasks')
        .select('title, description, tags, due_date')
        .eq('id', task_id)
        .single()

      if (!task) {
        return new Response(JSON.stringify({ error: 'Görev bulunamadı' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

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
{"value_score": N, "urgency_score": N, "risk_score": N, "effort_score": N, "friction_score": N, "reasoning": "${language === 'en' ? 'Short explanation' : 'Kısa açıklama'}"}`,
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

      const textBlock = response.content.find((block) => block.type === 'text')
      let suggestion: unknown = {}

      if (textBlock && textBlock.type === 'text') {
        try {
          const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            suggestion = JSON.parse(jsonMatch[0])
          }
        } catch {
          suggestion = { reasoning: textBlock.text }
        }
      }

      return new Response(JSON.stringify({ suggestion }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } else if (type === 'workout_plan') {
      // Bugün için antrenman planı önerileri
      const targetDate = date ?? clientToday ?? new Date().toISOString().split('T')[0]!

      // Son 7 günün antrenman geçmişi
      const { data: recentWorkoutData } = await supabase
        .from('workouts')
        .select('date, name, status, workout_sets(exercise:exercises(name, muscle_group:muscle_groups(name)))')
        .eq('user_id', user.id)
        .gte('date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!)
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
        model: 'claude-opus-4-6',
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
4. Gerekiyorsa dinlenme günü öner`
        }],
      })

      const textBlock = response.content.find((b) => b.type === 'text')
      let suggestions: unknown[] = []

      if (textBlock && textBlock.type === 'text') {
        try {
          const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/)
          if (jsonMatch) suggestions = JSON.parse(jsonMatch[0])
        } catch {
          suggestions = [{ type: 'general', message: textBlock.text }]
        }
      }

      return new Response(JSON.stringify({ suggestions }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } else if (type === 'workout_program_chat') {
      const exerciseCatalog = workout_context?.available_exercises ?? []

      if (exerciseCatalog.length === 0) {
        return new Response(JSON.stringify({
          message: 'Egzersiz kutuphanesi henuz hazir degil. Kutuphane yuklenince tekrar deneyin.',
          program: null,
        } satisfies WorkoutProgramResult), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const catalogNames = new Map(
        exerciseCatalog.map((exercise) => [normalizeExerciseName(exercise.name), exercise.name]),
      )

      const catalogSummary = exerciseCatalog.length > 0
        ? exerciseCatalog
            .slice(0, 200)
            .map((exercise) => `- ${exercise.name} | kategori: ${exercise.category ?? 'bilinmiyor'} | bolge: ${exercise.muscle_group ?? 'bilinmiyor'} | ekipman: ${exercise.is_bodyweight ? 'vucut agirligi' : 'ekipmanli'}`)
            .join('\n')
        : 'Katalog mevcut degil — genel bilginle egzersiz isimlerini Türkçe yaz.'

      const historySummary = workout_context?.history?.length
        ? workout_context.history.map((entry) => `${entry.role === 'user' ? 'Kullanıcı' : 'Asistan'}: ${entry.text}`).join('\n')
        : 'Geçmiş mesaj yok'

      const programResponse = await client.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 1800,
        system: `Sen LifeOS antrenman program asistanısın.
${langInstr} Sadece geçerli JSON döndür, başka metin ekleme.

Yanıt formatı:
{
  "message": "Kullanıcıya kısa cevap",
  "program": {
    "name": "Program adı",
    "description": "Kısa açıklama",
    "exercises": [
      { "exercise_name": "Katalogdaki isim", "sets": 3, "reps": 10, "weight_kg": 0 }
    ]
  }
}

Kurallar:
- Sadece verilen egzersiz kataloğundan isim seç.
- 4 ila 8 egzersiz öner.
- weight_kg bilinmiyorsa 0 ver.
- Kullanıcı isterse full body, upper/lower, push-pull-legs gibi uygun şablon kur.
- message alanında ne kurduğunu ve nedenini kısa açıkla.`,
        messages: [{
          role: 'user',
          content: `Kullanıcı isteği: ${user_message ?? 'Dengeli bir program oluştur'}

Önceki konuşma:
${historySummary}

Kullanılabilir egzersiz kataloğu:
${catalogSummary}`,
        }],
      })

      const programBlock = programResponse.content.find((block) => block.type === 'text')
      let programResult: WorkoutProgramResult = {
        message: 'Program taslagi hazirlanamadi',
        program: null,
      }

      if (programBlock && programBlock.type === 'text') {
        try {
          const match = programBlock.text.match(/\{[\s\S]*\}/)
          if (match) {
            const parsed = JSON.parse(match[0]) as {
              message?: unknown
              program?: {
                name?: unknown
                description?: unknown
                exercises?: Array<{
                  exercise_name?: unknown
                  sets?: unknown
                  reps?: unknown
                  weight_kg?: unknown
                }>
              }
            }

            const parsedExercises = Array.isArray(parsed.program?.exercises)
              ? parsed.program.exercises.flatMap((exercise): WorkoutProgramExercise[] => {
                  if (typeof exercise.exercise_name !== 'string') return []
                  const matchedName = catalogNames.get(normalizeExerciseName(exercise.exercise_name))
                  if (!matchedName) return []

                  const sets = typeof exercise.sets === 'number' && exercise.sets > 0
                    ? Math.round(exercise.sets)
                    : 3
                  const reps = typeof exercise.reps === 'number' && exercise.reps > 0
                    ? Math.round(exercise.reps)
                    : 10
                  const weightKg = typeof exercise.weight_kg === 'number' && exercise.weight_kg >= 0
                    ? exercise.weight_kg
                    : 0

                  return [{
                    exercise_name: matchedName,
                    sets,
                    reps,
                    weight_kg: weightKg,
                  }]
                })
              : []

            programResult = {
              message: typeof parsed.message === 'string' && parsed.message.trim().length > 0
                ? parsed.message.trim()
                : 'Bir program taslagi hazirlandi.',
              program: parsedExercises.length > 0
                ? {
                    name: typeof parsed.program?.name === 'string' && parsed.program.name.trim().length > 0
                      ? parsed.program.name.trim()
                      : 'AI Program',
                    description: typeof parsed.program?.description === 'string'
                      ? parsed.program.description.trim()
                      : '',
                    exercises: parsedExercises,
                  }
                : null,
            }
          }
        } catch {
          programResult = {
            message: programBlock.text,
            program: null,
          }
        }
      }

      if (!programResult.program && programResult.message.trim().length === 0) {
        programResult = {
          message: 'Program taslagi olusturulurken uygun egzersiz secilemedi. Istegi biraz daha netlestirip tekrar dene.',
          program: null,
        }
      }

      return new Response(JSON.stringify(programResult), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } else if (type === 'replan') {
      const targetDate = date ?? clientToday ?? new Date().toISOString().split('T')[0]!
      const today = clientToday ?? new Date().toISOString().split('T')[0]!
      const now = current_time ?? new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false })
      const planningCutoff = targetDate === today ? now : '00:00'

      const { data: tasks } = await supabase
        .from('tasks').select('id, title, status, effort_score, estimated_minutes, priority_score')
        .eq('scheduled_date', targetDate).not('status', 'in', '(done,deferred)').order('priority_score', { ascending: false })

      const pastBlocks   = (existing_blocks ?? []).filter((b) => b.end <= planningCutoff)
      const futureBlocks = (existing_blocks ?? []).filter((b) => b.end > planningCutoff)

      const pastSummary = pastBlocks.length > 0
        ? pastBlocks.map((b) => `✓ ${b.start}–${b.end}: ${b.label}`).join('\n')
        : '(Yok)'

      // Pass future blocks as JSON array so AI can reliably read IDs
      const futureBlocksJson = JSON.stringify(
        futureBlocks.map((b) => ({ id: b.id ?? null, start: b.start, end: b.end, label: b.label })),
        null, 2
      )

      const tasksList = tasks?.map((t) => `  - "${t.title}" (~${t.estimated_minutes ?? 60}dk, id: ${t.id})`).join('\n') ?? '  (Görev yok)'

      const replanResponse = await client.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 2000,
        system: `Sen LifeOS agentic planlama asistanısın.
${langInstr} Sadece mevcut saatten itibaren plan yap.

YANIT FORMATI — yalnızca geçerli JSON döndür, başka metin ekleme:
{
  "message": "Kullanıcıya kısa açıklama",
  "actions": []
}

Kullanılabilir action tipleri:
1. Blok ekle:   {"action":"add","block":{"date":"YYYY-MM-DD","start_time":"HH:MM","end_time":"HH:MM","block_type":"task|break|focus|routine|meal|workout","label":"isim"}}
2. Blok sil:    {"action":"remove","block_id":"<id>"}        ← id'yi aşağıdaki JSON'dan aynen kopyala
3. Blok taşı:   {"action":"move","block_id":"<id>","block":{"date":"YYYY-MM-DD","start_time":"HH:MM","end_time":"HH:MM"}}

TARIH KURALI: Kullanıcı yarın/ertesi gün gibi göreli tarih söylerse action.block.date alanına gerçek YYYY-MM-DD tarihini yaz. Tarih belirtilmediyse ${targetDate} kullan.
ÇAKIŞMA KURALI: Yeni blok eklerken önce çakışanları remove et (id'sini JSON'dan al), sonra add et.`,
        messages: [{
          role: 'user',
          content: `Kullanıcı: "${user_message ?? 'Günümü planla'}"

Şu anki saat: ${now} | Planlanacak tarih: ${targetDate} | Planlama başlangıcı: ${planningCutoff}

Tamamlanan bloklar (dokunma):
${pastSummary}

Kalan bloklar — id'leri remove/move için kullan:
${futureBlocksJson}

Bekleyen görevler:
${tasksList}

Max 22:00. Bloklar arası buffer: ${buffer_minutes ?? 15}dk.`,
        }],
      })

      const rBlock = replanResponse.content.find((b) => b.type === 'text')
      let replanResult: { message: string; actions: unknown[] } = { message: '', actions: [] }
      if (rBlock && rBlock.type === 'text') {
        try {
          const m = rBlock.text.match(/\{[\s\S]*\}/)
          if (m) replanResult = JSON.parse(m[0])
          else replanResult = { message: rBlock.text, actions: [] }
        } catch { replanResult = { message: rBlock.text, actions: [] } }
      }

      return new Response(JSON.stringify(replanResult), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } else if (type === 'nutrition_chat') {
      const ctx = nutrition_context
      if (!ctx) {
        return new Response(JSON.stringify({ error: 'nutrition_context gerekli' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const rem = {
        calories: Math.max(0, ctx.target.calories - ctx.consumed.calories),
        protein:  Math.max(0, ctx.target.protein  - ctx.consumed.protein),
        carbs:    Math.max(0, ctx.target.carbs    - ctx.consumed.carbs),
        fat:      Math.max(0, ctx.target.fat      - ctx.consumed.fat),
        fiber:    Math.max(0, ctx.target.fiber    - ctx.consumed.fiber),
      }

      const mealsSummary = ctx.meals_today.length > 0
        ? ctx.meals_today.map((m) =>
            `${m.meal_type}: ${m.items.map((i) => `${i.name} (${i.amount}${i.unit}, ${i.calories}kcal)`).join(', ')}`
          ).join('\n')
        : '(Henüz öğün kaydedilmedi)'

      const history = (ctx.history ?? []).map((h) => ({
        role: h.role as 'user' | 'assistant',
        content: h.text,
      }))

      const ncResp = await client.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 800,
        system: `Sen LifeOS beslenme koçusun. ${langInstr} Kısa ve pratik ol.

Kullanıcının günlük hedefleri:
- Kalori: ${ctx.target.calories} kcal, Protein: ${ctx.target.protein}g, Karb: ${ctx.target.carbs}g, Yağ: ${ctx.target.fat}g, Lif: ${ctx.target.fiber}g

Bugün tüketilen:
- Kalori: ${Math.round(ctx.consumed.calories)} kcal, Protein: ${Math.round(ctx.consumed.protein)}g, Karb: ${Math.round(ctx.consumed.carbs)}g, Yağ: ${Math.round(ctx.consumed.fat)}g, Lif: ${Math.round(ctx.consumed.fiber)}g

Kalan hedefler:
- Kalori: ${Math.round(rem.calories)} kcal, Protein: ${Math.round(rem.protein)}g, Karb: ${Math.round(rem.carbs)}g, Yağ: ${Math.round(rem.fat)}g, Lif: ${Math.round(rem.fiber)}g

Bugünkü öğünler:
${mealsSummary}

Kurallar:
- ${language === 'en' ? 'Suggest accessible and practical food options' : 'Yiyecek önerirken Türk mutfağına yakın ve ulaşılabilir seçenekler sun'}
- Makro değerleri tahmini olarak belirt (örn: "~25g protein")
- Hedef doluysa veya aşılmışsa bunu belirt
- 3-4 cümleyi aşma, gereksiz uzatma`,
        messages: [
          ...history,
          { role: 'user', content: user_message ?? 'Ne yiyebilirim?' },
        ],
      })

      const ncBlock = ncResp.content.find((b) => b.type === 'text')
      return new Response(
        JSON.stringify({ message: ncBlock?.type === 'text' ? ncBlock.text : '' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(JSON.stringify({ error: 'Geçersiz istek tipi' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('ai-suggest error:', error)
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    console.error('ai-suggest stack:', stack)
    return new Response(
      JSON.stringify({ error: 'AI öneri oluşturulurken hata oluştu', detail: message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
