// supabase/functions/_shared/ai/coach.ts
//
// AI koç sohbetlerinin prompt kurulumu ve yanıt ayrıştırması.
// index.ts yalnızca HTTP + veri toplama işini yapar; "koçun ne bildiği ve nasıl
// konuştuğu" burada durur. Sohbetler (beslenme, antrenman ve planner.ts'teki
// planlama) aynı sözleşmeyi paylaşır: model her zaman tek bir JSON nesnesi
// döndürür ve `message` alanı kullanıcıya gösterilecek metindir. Bu dosya ortak
// yardımcıları ve beslenme koçunu taşır; antrenman koçu workoutCoach.ts'te.

export type Lang = 'tr' | 'en'

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Anthropic `system` alani: metin bloklari dizisi. */
export interface SystemBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

/**
 * Sistem promptunu iki bloga ayirir: kullanicidan bagimsiz SABIT kisim ve her
 * istekte degisen kullanici verisi.
 *
 * Neden bu ayrim: prompt onbellegi ONEK eslesmesidir. Onekte tek bir bayt
 * degisirse ondan SONRAKI her sey yeniden faturalanir. Uc prompt da eskiden
 * kullanici verisini basa, sabit kurallari sona koyuyordu; olculen sonuc, iki
 * farkli kullanicinin promptu arasindaki ortak onegin yalnizca ~130 token
 * olmasiydi (beslenme 967 tokenin 137'si, antrenman 3771 tokenin 120'si).
 * Yani sabit metnin tamami her turda yeniden odeniyordu.
 *
 * Sirayi ters cevirmek metnin ICERIGINI degistirmiyor, yalnizca modelin
 * gordugu duzeni degistiriyor; buna karsilik sabit kisim onbellege giriyor ve
 * tekrar okundugunda normal girdi fiyatinin ~%10'una dusuyor.
 */
export function systemBlocks(stable: string, volatile: string): SystemBlock[] {
  return [
    { type: 'text', text: stable, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: volatile },
  ]
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
  // Talimatlar Türkçe olduğu için model JSON alanlarını ve ekran adlarını
  // oradan kopyalıyordu; İngilizcede bunları tek tek söylemek gerekiyor.
  en: 'Respond in English. Every user-facing text must be English, including program name, description, day_name and notes. Keep exercise_name exactly as in the catalog. Call app screens by their English names: the Workout screen and the My Equipment card.',
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
  /** Son 7 günün günlük ortalaması: trend yorumu için. Veri yoksa null. */
  weeklyAverage: Macros | null
  weeklyDaysLogged: number
  /** Kullanıcının yerel saati "HH:MM": sabah mı akşam mı önerisi için. */
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
  system: SystemBlock[]
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

  // ── SABİT: her kullanıcı ve her tur için aynı ──
  const stable = `Sen LifeOS'un beslenme koçusun. ${langLine(input.lang)}

KİMLİĞİN
Gerçek bir koç gibi konuş: net, pratik, yargılamayan. Genel geçer öğüt verme
("dengeli beslen", "bol su iç" gibi cümleler yasak) — kullanıcının BUGÜNKÜ
sayılarına bakarak somut bir sonraki adım söyle.

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

  // ── DEĞİŞKEN: her istekte yeniden yazılır ──
  const volatile = `BUGÜNÜN VERİSİ (saat ${input.localTime})
Hedef:     ${macroLine(input.target)}
Tüketilen: ${macroLine(input.consumed)}
Kalan:     ${macroLine(rem)}
${overshoot}

Bugünkü öğünler:
${mealsSummary}

${trend}`

  const messages = sanitizeMessages([
    ...historyToMessages(input.history),
    { role: 'user', content: input.userMessage },
  ])

  return { system: systemBlocks(stable, volatile), messages }
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
  // JSON çıkmadıysa modelin düz metnini kaybetmeyiz: kullanıcı yine bir cevap görür.
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
