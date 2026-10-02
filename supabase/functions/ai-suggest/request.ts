// supabase/functions/ai-suggest/request.ts
// İstek gövdesi, rotaların paylaştığı bağlam ve sohbet geçmişinin normalleştirilmesi.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.47.2'
import type Anthropic from 'npm:@anthropic-ai/sdk'
import type { ChatTurn, Lang, WorkoutCatalogEntry } from '../_shared/ai/coach.ts'
import type { AiLedger } from '../_shared/ai/usage.ts'

export interface SuggestRequest {
  type: 'daily_plan' | 'task_priority' | 'workout_plan' | 'workout_program_chat' | 'replan' | 'nutrition_chat' | 'brain_dump'
  language?: Lang
  date?: string
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
