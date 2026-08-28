// supabase/functions/_shared/ai/coach.ts
//
// AI koç sohbetlerinin prompt kurulumu ve yanıt ayrıştırması.
// index.ts yalnızca HTTP + veri toplama işini yapar; "koçun ne bildiği ve nasıl
// konuştuğu" burada durur. Üç sohbet de (beslenme, antrenman, planlama) aynı
// sözleşmeyi paylaşır: model her zaman tek bir JSON nesnesi döndürür ve
// `message` alanı kullanıcıya gösterilecek metindir.

export type Lang = 'tr' | 'en'

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Model bazen JSON'u kod bloğuna sarar ya da önüne bir cümle koyar.
 * Dıştaki ilk dengeli süslü parantez bloğunu çıkarır; bulamazsa null döner.
 */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced?.[1] ?? text
  const start = candidate.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i]!
    if (escaped) { escaped = false; continue }
    if (ch === '\\') { escaped = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        try {
          const parsed: unknown = JSON.parse(candidate.slice(start, i + 1))
          return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
        } catch {
          return null
        }
      }
    }
  }
  return null
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

export function asInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/** Sohbet geçmişini Anthropic messages dizisine çevirir; boş turları atar. */
export function historyToMessages(history: ChatTurn[] | undefined, limit = 8): AnthropicMessage[] {
  if (!history?.length) return []
  return history
    .filter((turn) => typeof turn.text === 'string' && turn.text.trim().length > 0)
    .slice(-limit)
    .map((turn) => ({
      role: turn.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: turn.text.trim(),
    }))
}

/**
 * Anthropic aynı rolün art arda gelmesine izin vermez ve ilk mesaj `user`
 * olmalıdır. Geçmiş istemciden geldiği için bu garantiler yok: kullanıcı
 * peş peşe iki mesaj atıp ilkine yanıt gelmemişse dizi bozulur ve API 400 döner.
 */
export function sanitizeMessages(messages: AnthropicMessage[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = []
  for (const msg of messages) {
    if (out.length === 0 && msg.role !== 'user') continue
    const prev = out[out.length - 1]
    if (prev && prev.role === msg.role) {
      out[out.length - 1] = { role: msg.role, content: `${prev.content}\n\n${msg.content}` }
      continue
    }
    out.push(msg)
  }
  return out
}

const LANG_LINE: Record<Lang, string> = {
  tr: 'Türkçe yanıt ver.',
  en: 'Respond in English.',
}

export function langLine(lang: Lang | undefined): string {
  return LANG_LINE[lang === 'en' ? 'en' : 'tr']
}

// ============================================================
// Beslenme koçu
// ============================================================

export interface Macros {
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
}

export interface NutritionCoachInput {
  lang: Lang
  target: Macros
  consumed: Macros
  mealsToday: { meal_type: string; items: { name: string; amount: number; unit: string; calories: number }[] }[]
  /** Son 7 günün günlük ortalaması — trend yorumu için. Veri yoksa null. */
  weeklyAverage: Macros | null
  weeklyDaysLogged: number
  /** Kullanıcının yerel saati "HH:MM" — sabah mı akşam mı önerisi için. */
  localTime: string
  history: ChatTurn[]
  userMessage: string
}

const MEAL_TYPE_TR: Record<string, string> = {
  breakfast: 'Kahvaltı',
  lunch: 'Öğle',
  dinner: 'Akşam',
  snack: 'Ara öğün',
}

function macroLine(m: Macros): string {
  return `${Math.round(m.calories)} kcal · P ${Math.round(m.protein)}g · K ${Math.round(m.carbs)}g · Y ${Math.round(m.fat)}g · Lif ${Math.round(m.fiber)}g`
}

function remaining(target: Macros, consumed: Macros): Macros {
  return {
    calories: target.calories - consumed.calories,
    protein: target.protein - consumed.protein,
    carbs: target.carbs - consumed.carbs,
    fat: target.fat - consumed.fat,
    fiber: target.fiber - consumed.fiber,
  }
}

export function buildNutritionCoachPrompt(input: NutritionCoachInput): {
  system: string
  messages: AnthropicMessage[]
} {
  const rem = remaining(input.target, input.consumed)

  const mealsSummary = input.mealsToday.length > 0
    ? input.mealsToday
        .map((m) => {
          const label = MEAL_TYPE_TR[m.meal_type] ?? m.meal_type
          const items = m.items.map((i) => `${i.name} ${i.amount}${i.unit} (${Math.round(i.calories)} kcal)`).join(', ')
          return `- ${label}: ${items || '(boş)'}`
        })
        .join('\n')
    : '- (Bugün henüz öğün kaydedilmemiş)'

  const trend = input.weeklyAverage && input.weeklyDaysLogged >= 2
    ? `Son 7 günün günlük ortalaması (${input.weeklyDaysLogged} gün kayıtlı): ${macroLine(input.weeklyAverage)}`
    : 'Haftalık trend için yeterli kayıt yok.'

  // Kalan makro negatifse hedef aşılmış demektir; modelin bunu "kalan" sanıp
  // üzerine yemek önermesini engellemek için açıkça yazıyoruz.
  const overshoot = rem.calories < 0
    ? `DİKKAT: Kalori hedefi ${Math.abs(Math.round(rem.calories))} kcal aşılmış.`
    : ''

  const system = `Sen LifeOS'un beslenme koçusun. ${langLine(input.lang)}

KİMLİĞİN
Gerçek bir koç gibi konuş: net, pratik, yargılamayan. Genel geçer öğüt verme
("dengeli beslen", "bol su iç" gibi cümleler yasak) — kullanıcının BUGÜNKÜ
sayılarına bakarak somut bir sonraki adım söyle.

BUGÜNÜN VERİSİ (saat ${input.localTime})
Hedef:     ${macroLine(input.target)}
Tüketilen: ${macroLine(input.consumed)}
Kalan:     ${macroLine(rem)}
${overshoot}

Bugünkü öğünler:
${mealsSummary}

${trend}

KURALLAR
1. Yiyecek önerirken Türk mutfağından ve markette bulunabilen şeylerden seç.
   Her öneri için porsiyonu gram/adet olarak ver ve tahmini makroyu yaz
   (ör. "180g yoğurt + 30g ceviz ≈ 320 kcal, 12g protein").
2. Önerdiğin şey kalan makroya SIĞMALI. Kalan kalori azsa düşük kalorili öner;
   hedef aşılmışsa bunu söyle ve yemek önerme, telafi öner.
3. Kullanıcı ne yediğini anlatıyorsa ("2 yumurta yedim") bunu kaydetmeyi öner
   ve actions içine log_meal ekle.
4. Sağlık teşhisi koyma, ilaç/takviye dozu verme. Tıbbi bir durum ima
   ediliyorsa (hamilelik, diyabet, yeme bozukluğu, ilaç etkileşimi) kısa bir
   uyarı ver ve hekime/diyetisyene yönlendir.
5. Varsayılan uzunluk 3-5 cümle. Kullanıcı "detaylı anlat", "plan yap" gibi bir
   şey isterse uzun yanıt verebilirsin.
6. Emin olmadığın bir sayıyı uydurma; "yaklaşık" olduğunu belirt.

YANIT BİÇİMİ — yalnızca geçerli JSON döndür, başka hiçbir metin ekleme:
{
  "message": "kullanıcıya gösterilecek metin",
  "actions": [
    { "action": "log_meal", "meal_type": "breakfast|lunch|dinner|snack", "text": "2 yumurta, 1 dilim tam buğday ekmek" }
  ]
}
actions boş dizi olabilir. log_meal.text, uygulamanın besin çözümleyicisine
gidecek serbest metindir: sadece yiyecek ve miktar yaz, açıklama ekleme.
Kullanıcı bir şey yediğini söylediğinde veya senin önerini kabul ettiğinde
log_meal ekle; sadece soru soruyorsa ekleme.`

  const messages = sanitizeMessages([
    ...historyToMessages(input.history),
    { role: 'user', content: input.userMessage },
  ])

  return { system, messages }
}

export interface NutritionCoachAction {
  action: 'log_meal'
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  text: string
}

export interface NutritionCoachResult {
  message: string
  actions: NutritionCoachAction[]
}

const MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'snack'])

export function parseNutritionCoachResult(text: string): NutritionCoachResult {
  const parsed = extractJsonObject(text)
  // JSON çıkmadıysa modelin düz metnini kaybetmeyiz — kullanıcı yine bir cevap görür.
  if (!parsed) return { message: text.trim(), actions: [] }

  const rawActions = Array.isArray(parsed['actions']) ? parsed['actions'] : []
  const actions = rawActions.flatMap((entry): NutritionCoachAction[] => {
    if (!entry || typeof entry !== 'object') return []
    const record = entry as Record<string, unknown>
    if (record['action'] !== 'log_meal') return []
    const mealText = asString(record['text'])
    if (!mealText) return []
    const mealType = asString(record['meal_type'], 'snack')
    return [{
      action: 'log_meal',
      meal_type: (MEAL_TYPES.has(mealType) ? mealType : 'snack') as NutritionCoachAction['meal_type'],
      text: mealText,
    }]
  })

  return {
    message: asString(parsed['message'], text.trim()),
    actions,
  }
}

// ============================================================
// Antrenman koçu
// ============================================================

export interface WorkoutCatalogEntry {
  name: string
  category?: string
  muscle_group?: string
  is_bodyweight?: boolean
}

export interface WorkoutCoachInput {
  lang: Lang
  catalog: WorkoutCatalogEntry[]
  /** Son antrenmanlar — "dün bacak yaptım" bilgisini modele vermek için. */
  recentWorkouts: { date: string; name: string; muscle_groups: string[] }[]
  existingProgramNames: string[]
  history: ChatTurn[]
  userMessage: string
}

export function buildWorkoutCoachPrompt(input: WorkoutCoachInput): {
  system: string
  messages: AnthropicMessage[]
} {
  // Katalog uzun; modele bölgeye göre gruplanmış veriyoruz ki gün kurgularken
  // "bu güne hangi hareketler uyar" sorusunu tarayarak değil bakarak çözsün.
  const byGroup = new Map<string, string[]>()
  for (const entry of input.catalog) {
    const key = entry.muscle_group ?? 'Diğer'
    const list = byGroup.get(key) ?? []
    list.push(entry.is_bodyweight ? `${entry.name} (vücut ağırlığı)` : entry.name)
    byGroup.set(key, list)
  }
  const catalogSummary = [...byGroup.entries()]
    .map(([group, names]) => `${group}: ${names.join(', ')}`)
    .join('\n')

  const recentSummary = input.recentWorkouts.length > 0
    ? input.recentWorkouts
        .map((w) => `- ${w.date}: ${w.name} (${w.muscle_groups.join(', ') || 'kas grubu kayıtsız'})`)
        .join('\n')
    : '- (Son 14 günde tamamlanmış antrenman yok)'

  const programsSummary = input.existingProgramNames.length > 0
    ? input.existingProgramNames.map((n) => `- ${n}`).join('\n')
    : '- (Kayıtlı program yok)'

  const system = `Sen LifeOS'un antrenman koçusun. ${langLine(input.lang)}

KİMLİĞİN
Salonda yanında duran bir antrenör gibi konuş. Kullanıcı soru soruyorsa cevap
ver; program istiyorsa haftalık program yaz. Her seferinde program üretmek
zorunda değilsin.

KULLANICININ DURUMU
Son antrenmanlar:
${recentSummary}

Kayıtlı programları:
${programsSummary}

KULLANILABİLİR EGZERSİZ KATALOĞU (kas grubuna göre)
${catalogSummary}

PROGRAM YAZMA KURALLARI
1. Egzersiz adlarını YALNIZCA yukarıdaki katalogdan, birebir yazıldığı gibi seç.
   Katalogda olmayan bir hareketi programa koyma; en yakın alternatifi seç.
2. Haftada 2-6 gün. Her günde 4-8 hareket.
3. Bileşik hareketle başla, izolasyonla bitir.
4. Her kas grubunu haftada en az 2 kez çalıştır (bro split özellikle istenmedikçe).
5. rest_seconds: ağır bileşik 120-180, orta 90, izolasyon 45-60.
6. Gün adı ne çalışıldığını söylesin ("İtiş — Göğüs/Omuz/Triceps" gibi).
7. Kullanıcı hedefini söylemediyse sorup durma: makul bir varsayım yap,
   message içinde varsayımını tek cümleyle belirt ve programı yine de ver.
8. Sakatlık, ağrı veya tıbbi bir durumdan söz edilirse program yazmadan önce
   hekim/fizyoterapist önerisi olduğunu belirt.

YANIT BİÇİMİ — yalnızca geçerli JSON döndür, başka hiçbir metin ekleme:
{
  "message": "kullanıcıya gösterilecek metin",
  "program": {
    "name": "Program adı",
    "description": "Kimin için, neye göre kurulduğu — 1-2 cümle",
    "split_type": "full_body|upper_lower|push_pull_legs|bro_split|custom",
    "days": [
      {
        "day_name": "Gün adı",
        "exercises": [
          { "exercise_name": "Katalogdaki isim", "sets": 3, "reps": 10, "rest_seconds": 90, "notes": "opsiyonel kısa not" }
        ]
      }
    ]
  }
}
Program üretmiyorsan "program": null ver. message alanı her durumda dolu olmalı.`

  const messages = sanitizeMessages([
    ...historyToMessages(input.history),
    { role: 'user', content: input.userMessage },
  ])

  return { system, messages }
}

export interface WorkoutProgramExercise {
  exercise_name: string
  sets: number
  reps: number
  rest_seconds: number
  notes: string | null
  /** Eski istemciler için — yeni akışta kullanılmıyor. */
  weight_kg: number
}

export interface WorkoutProgramDay {
  day_name: string
  exercises: WorkoutProgramExercise[]
}

export interface WorkoutProgramPayload {
  name: string
  description: string
  split_type: string
  frequency_per_week: number
  days: WorkoutProgramDay[]
  /**
   * Günleri düzleştirilmiş hali. App Store'daki eski sürümler program.exercises
   * okuyor; alanı kaldırmak onları bozardı.
   */
  exercises: WorkoutProgramExercise[]
}

export interface WorkoutCoachResult {
  message: string
  program: WorkoutProgramPayload | null
}

const SPLIT_TYPES = new Set(['full_body', 'upper_lower', 'push_pull_legs', 'bro_split', 'custom'])

/**
 * Model çıktısını kataloğa karşı doğrular. Eşleşmeyen hareketler sessizce
 * düşürülür: uydurulmuş bir egzersiz adı istemcide çözülemeyeceği için
 * programa yazılırsa boş satır olarak görünür.
 */
export function parseWorkoutCoachResult(
  text: string,
  resolveName: (name: string) => string | null,
): WorkoutCoachResult {
  const parsed = extractJsonObject(text)
  if (!parsed) return { message: text.trim(), program: null }

  const message = asString(parsed['message'], text.trim())
  const rawProgram = parsed['program']
  if (!rawProgram || typeof rawProgram !== 'object') return { message, program: null }

  const programRecord = rawProgram as Record<string, unknown>
  const rawDays = Array.isArray(programRecord['days']) ? programRecord['days'] : []

  const days = rawDays.flatMap((rawDay, dayIndex): WorkoutProgramDay[] => {
    if (!rawDay || typeof rawDay !== 'object') return []
    const dayRecord = rawDay as Record<string, unknown>
    const rawExercises = Array.isArray(dayRecord['exercises']) ? dayRecord['exercises'] : []

    const exercises = rawExercises.flatMap((rawExercise): WorkoutProgramExercise[] => {
      if (!rawExercise || typeof rawExercise !== 'object') return []
      const exerciseRecord = rawExercise as Record<string, unknown>
      const requested = asString(exerciseRecord['exercise_name'])
      if (!requested) return []
      const matched = resolveName(requested)
      if (!matched) return []

      return [{
        exercise_name: matched,
        sets: asInt(exerciseRecord['sets'], 3, 1, 10),
        reps: asInt(exerciseRecord['reps'], 10, 1, 100),
        rest_seconds: asInt(exerciseRecord['rest_seconds'], 90, 15, 300),
        notes: asString(exerciseRecord['notes']) || null,
        weight_kg: 0,
      }]
    })

    if (exercises.length === 0) return []
    return [{
      day_name: asString(dayRecord['day_name'], `Gün ${dayIndex + 1}`),
      exercises,
    }]
  })

  if (days.length === 0) return { message, program: null }

  const splitType = asString(programRecord['split_type'], 'custom')

  return {
    message,
    program: {
      name: asString(programRecord['name'], 'AI Program'),
      description: asString(programRecord['description']),
      split_type: SPLIT_TYPES.has(splitType) ? splitType : 'custom',
      frequency_per_week: days.length,
      days,
      exercises: days.flatMap((day) => day.exercises),
    },
  }
}

// ============================================================
// Planlama koçu (replan)
// ============================================================

export interface PlannerTask {
  id: string
  title: string
  estimated_minutes: number | null
  priority_score: number | null
  scheduled_date: string | null
}

export interface PlannerInput {
  lang: Lang
  targetDate: string
  /** Bugünün tarihi — "yarın" gibi göreli ifadeleri çözmek için. */
  today: string
  now: string
  /** Bu saatten öncesi planlanmaz: geçmiş gün için '00:00'. */
  planningCutoff: string
  energyLevel: number | null
  bufferMinutes: number
  pastBlocks: { id?: string; start: string; end: string; label: string }[]
  futureBlocks: { id?: string; start: string; end: string; label: string }[]
  scheduledTasks: PlannerTask[]
  backlogTasks: PlannerTask[]
  history: ChatTurn[]
  userMessage: string
}

function taskLine(task: PlannerTask): string {
  const minutes = task.estimated_minutes ?? 60
  const priority = task.priority_score !== null ? ` · öncelik ${task.priority_score.toFixed(1)}` : ''
  return `- "${task.title}" (~${minutes}dk${priority}, id: ${task.id})`
}

export function buildPlannerPrompt(input: PlannerInput): {
  system: string
  messages: AnthropicMessage[]
} {
  const pastSummary = input.pastBlocks.length > 0
    ? input.pastBlocks.map((b) => `✓ ${b.start}–${b.end}: ${b.label}`).join('\n')
    : '(Yok)'

  const futureBlocksJson = JSON.stringify(
    input.futureBlocks.map((b) => ({ id: b.id ?? null, start: b.start, end: b.end, label: b.label })),
    null,
    2,
  )

  const scheduledList = input.scheduledTasks.length > 0
    ? input.scheduledTasks.map(taskLine).join('\n')
    : '(Bu güne atanmış görev yok)'

  const backlogList = input.backlogTasks.length > 0
    ? input.backlogTasks.map(taskLine).join('\n')
    : '(Bekleyen görev yok)'

  const system = `Sen LifeOS'un planlama koçusun. ${langLine(input.lang)}

KİMLİĞİN
Kullanıcının gününü onun adına düzenliyorsun. İki şey yapabilirsin: soruyu
cevaplamak, ve takvimde değişiklik yapmak. İkisini karıştırma — kullanıcı
"bugün ne yapmalıyım" diye soruyorsa yalnızca cevap ver, takvimi kendiliğinden
değiştirme.

ZAMAN
Şu an: ${input.now} · Bugün: ${input.today} · Planlanan gün: ${input.targetDate}
${input.planningCutoff} saatinden ÖNCESİNE hiçbir şey koyma. Gün 22:00'de biter.
Bloklar arasında ${input.bufferMinutes} dakika boşluk bırak.
Enerji seviyesi: ${input.energyLevel !== null ? `${input.energyLevel}/5` : 'belirtilmemiş'}

TAMAMLANMIŞ BLOKLAR (dokunma)
${pastSummary}

KALAN BLOKLAR — remove/move için id'yi buradan aynen kopyala
${futureBlocksJson}

BU GÜNE ATANMIŞ GÖREVLER
${scheduledList}

BEKLEYEN GÖREVLER (henüz güne atanmamış — boşluk varsa buradan çek)
${backlogList}

KURALLAR
1. Blok id'si UYDURMA. Yalnızca yukarıdaki JSON'da geçen id'leri kullan.
   Silinecek bir blok yoksa remove action'ı üretme.
2. Yeni blok eklerken çakışan blok varsa önce onu remove et.
3. Enerji düşükse (1-2) ağır odak bloklarını kısalt, mola sıklığını artır.
   Enerji yüksekse (4-5) uzun odak bloğu koyabilirsin.
4. Bir görevi bloğa dönüştürüyorsan label'a görev başlığını yaz.
5. Öğle yemeği için gün içinde en az 30 dakika bırak.
6. message alanında ne yaptığını tek paragrafta özetle; aksiyon listesini
   madde madde tekrar etme, kullanıcı zaten ekranda görecek.

YANIT BİÇİMİ — yalnızca geçerli JSON döndür, başka hiçbir metin ekleme:
{
  "message": "kullanıcıya gösterilecek metin",
  "actions": [
    {"action":"add","block":{"date":"YYYY-MM-DD","start_time":"HH:MM","end_time":"HH:MM","block_type":"task|break|focus|routine|meal|workout","label":"isim"}},
    {"action":"remove","block_id":"<yukarıdaki id>"},
    {"action":"move","block_id":"<yukarıdaki id>","block":{"date":"YYYY-MM-DD","start_time":"HH:MM","end_time":"HH:MM"}}
  ]
}
Takvimi değiştirmen gerekmiyorsa "actions": [] ver.
Göreli tarih ("yarın") geçerse block.date alanına gerçek YYYY-MM-DD yaz;
tarih belirtilmediyse ${input.targetDate} kullan.`

  const messages = sanitizeMessages([
    ...historyToMessages(input.history),
    { role: 'user', content: input.userMessage },
  ])

  return { system, messages }
}

export interface PlannerResult {
  message: string
  actions: Record<string, unknown>[]
}

/** Var olmayan id'ye remove/move üretmek istemcide sessiz hataya yol açıyordu. */
export function parsePlannerResult(text: string, knownBlockIds: Set<string>): PlannerResult {
  const parsed = extractJsonObject(text)
  if (!parsed) return { message: text.trim(), actions: [] }

  const rawActions = Array.isArray(parsed['actions']) ? parsed['actions'] : []
  const actions = rawActions.flatMap((entry): Record<string, unknown>[] => {
    if (!entry || typeof entry !== 'object') return []
    const record = entry as Record<string, unknown>
    const action = record['action']
    if (action === 'add') return record['block'] && typeof record['block'] === 'object' ? [record] : []
    if (action === 'remove' || action === 'move') {
      const blockId = asString(record['block_id'])
      if (!blockId || !knownBlockIds.has(blockId)) return []
      if (action === 'move' && (!record['block'] || typeof record['block'] !== 'object')) return []
      return [record]
    }
    return []
  })

  return { message: asString(parsed['message'], text.trim()), actions }
}
