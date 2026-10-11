// supabase/functions/ai-suggest/request.ts
// İstek gövdesi, rotaların paylaştığı bağlam ve sohbet geçmişinin normalleştirilmesi.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.47.2'
import type Anthropic from 'npm:@anthropic-ai/sdk'
import type { ChatTurn, Lang } from '../_shared/ai/coach.ts'
import type { WorkoutCatalogEntry } from '../_shared/ai/workoutCoach.ts'
import type { AiLedger } from '../_shared/ai/usage.ts'
import { isIsoDate } from '../_shared/ai/muscleLoad.ts'

export interface SuggestRequest {
  type:
    | 'daily_plan' | 'task_priority' | 'workout_plan' | 'workout_program_chat' | 'replan'
    | 'nutrition_chat' | 'brain_dump' | 'life_setup' | 'daily_report'
  language?: Lang
  /** replan: planlanan gün. daily_report: raporun günü (YYYY-MM-DD, zorunlu). */
  date?: string
  /** life_setup: kullanıcının serbest metinle yazdığı hayat planı (en çok 8000 karakter). */
  text?: string
  /**
   * İstemcinin YEREL bugün tarihi (YYYY-MM-DD). Sunucu UTC'de çalıştığı için
   * toISOString() burada yanlış gün verir: UTC+3'te gece 00:00 ile 03:00 arası
   * bir önceki günü döndürür, bu da "hedef gün bugün mü" testini bozup
   * planlamayı geçmiş saatlerden başlatır. İstemci göndermezse (web antrenman
   * rotaları, eski sürümler) kullanıcının kayıtlı saat diliminden hesaplanır.
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
  // nutrition_chat: yeni istemciler nutrition_context, eskiler düz alanlar gönderir
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

/**
 * Rota işleyicilerinin ortak bağlamı. İstemciler index.ts'te istek başına bir kez
 * kurulur; rotalar aynı supabase ve Anthropic istemcisini, aynı defteri paylaşır.
 */
export interface RouteContext {
  supabase: SupabaseClient
  userId: string
  body: SuggestRequest
  client: Anthropic
  /** Bütçe durumuna göre seçilmiş sohbet modeli (CHAT_MODEL ya da BUDGET_CHAT_MODEL). */
  chatModel: string
  ledger: AiLedger
  lang: Lang
  langInstr: string
  /** Kullanıcının yerel bugün tarihi (YYYY-MM-DD). */
  today: string
  json: (body: unknown, status?: number) => Response
}

/**
 * Yayındaki istemciler iki farklı geçmiş biçimi gönderiyor: web `{role, text}`,
 * App Store'daki mobil sürüm `{role, content}`. İkisini de kabul ediyoruz:
 * biçimi tek tarafa zorlamak eski sürümlerde sohbet hafızasını siler.
 */
export function normalizeHistory(raw: unknown): ChatTurn[] {
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

// replan ücretsiz katmanda açık: girdi boyu sınırsız kalırsa tek bir ücretsiz
// hak, istemcinin gönderdiği kadar büyük (ve pahalı) bir isteme dönüşür.
// Kullanıcı mesajı istemcide de aynı sınırla kesiliyor (AI_CHAT_MESSAGE_MAX).
export const REPLAN_MESSAGE_MAX = 2000
/** Geçmişteki tek mesaj. Asistan cevabı değişiklik listesini de taşıyor. */
export const REPLAN_HISTORY_TURN_MAX = 4000
/** Planner zaten son 8 mesajı kullanıyor; fazlası hiç işlenmesin. */
export const REPLAN_HISTORY_TURNS = 8
export const REPLAN_BLOCKS_MAX = 150
export const REPLAN_LABEL_MAX = 120

// Postgres `time` gün sonunu 24:00:00 olarak tutabiliyor.
const BLOCK_TIME = /^(([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?|24:00(:00)?)$/

export interface ReplanBlock { id?: string; start: string; end: string; label: string }

export type ReplanInput =
  | {
      ok: true
      date: string | null
      currentTime: string | null
      userMessage: string
      history: ChatTurn[]
      blocks: ReplanBlock[]
    }
  | { ok: false; error: string; code: string; max?: number }

/** "24:05" (en-US hour12:false gece yarısı) ya da "9:05" gibi saatleri HH:MM'e indirir. */
function readClock(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 24 || minute > 59) return null
  return `${String(hour % 24).padStart(2, '0')}:${match[2]}`
}

/**
 * replan isteğinin istemciden gelen alanlarını modele gitmeden ÖNCE doğrular.
 * Ret, hak ayrılmadan döner: ücretsiz kullanıcının hakkı yanmaz.
 * Kullanıcının yazdığı mesaj sessizce kesilmez (life_setup ile aynı ilke);
 * geçmiş ve blok etiketleri ise kısaltılır, onlar kullanıcının şu an yazdığı metin değil.
 * Bozuk blok atlanır, isteği düşürmez: tek bir tuhaf kayıt planlamayı kilitlemesin.
 */
export function readReplanInput(body: SuggestRequest): ReplanInput {
  const message = typeof body.user_message === 'string' ? body.user_message.trim() : ''
  if (message.length > REPLAN_MESSAGE_MAX) {
    return {
      ok: false,
      error: `Mesaj en çok ${REPLAN_MESSAGE_MAX} karakter olabilir`,
      code: 'message_too_long',
      max: REPLAN_MESSAGE_MAX,
    }
  }

  if (body.date !== undefined && body.date !== null && !isIsoDate(body.date)) {
    return { ok: false, error: 'Geçersiz tarih', code: 'invalid_date' }
  }

  const rawBlocks: unknown = body.existing_blocks
  const blocks: ReplanBlock[] = []
  for (const raw of Array.isArray(rawBlocks) ? rawBlocks.slice(0, REPLAN_BLOCKS_MAX) : []) {
    const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null
    const start = record?.['start']
    const end = record?.['end']
    if (typeof start !== 'string' || typeof end !== 'string' || !BLOCK_TIME.test(start) || !BLOCK_TIME.test(end)) continue
    const id = record?.['id']
    const label = typeof record?.['label'] === 'string' ? record['label'] as string : ''
    blocks.push({
      ...(typeof id === 'string' && id.length <= 64 ? { id } : {}),
      start,
      end,
      label: Array.from(label.replace(/\s+/g, ' ').trim()).slice(0, REPLAN_LABEL_MAX).join(''),
    })
  }

  const history = normalizeHistory(Array.isArray(body.history) ? body.history.slice(-REPLAN_HISTORY_TURNS) : [])
    .map((turn) => ({ ...turn, text: Array.from(turn.text).slice(0, REPLAN_HISTORY_TURN_MAX).join('') }))

  return {
    ok: true,
    date: typeof body.date === 'string' ? body.date : null,
    currentTime: readClock(body.current_time),
    userMessage: message,
    history,
    blocks,
  }
}
