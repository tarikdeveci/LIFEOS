// AI tanıtım satırı: günlük bildirime haftada en çok bir kez eklenen tek cümle (#53).
// Karar mantığı saf (Deno'suz denenir); veritabanı okuması ayrı fonksiyonda.
//
// Kim görür: Pro ya da deneme olmayan ve AI'ı hiç denememiş ya da az kullanmış kullanıcı.
// Pro kullanıcıya satır gitmez (zaten sahip), AI'ı sık kullanana gitmez (tanıtım gereksiz).
// Sıklık sınırı notification_log'dan okunur: satır gönderilirken yazılan kilit kaydı
// (kind = 'daily_digest_ai_tip') aynı zamanda sıklık kaydıdır. Gün hesabı kullanıcının
// yerel günüyle (local_date) yapılır, UTC ile değil.

import { dayIndex } from './copy.ts'

export const AI_TIP_KIND = 'ai_tip'
export const AI_TIP_LOG_KIND = `daily_digest_${AI_TIP_KIND}`
/** İki satır arası en az bu kadar yerel gün. */
export const AI_TIP_INTERVAL_DAYS = 7
/** Son 30 günde bu kadar ya da daha çok AI kullanan kullanıcıya tanıtım gösterilmez. */
export const AI_TIP_HEAVY_USE = 3

export interface AiTipFacts {
  /** Etkin Pro aboneliği ya da deneme. */
  hasAiPlan: boolean
  /** Son 30 günde `ai_used` olayı sayısı. */
  aiUsed30d: number
  /** Son tanıtım satırının yerel günü (YYYY-MM-DD), hiç gönderilmediyse null. */
  lastTipDate: string | null
}

export type AiTipAudience = 'new' | 'tried'

/** Bugün satır eklenmeli mi, eklenecekse hangi kitleye göre? */
export function aiTipAudience(facts: AiTipFacts, today: string): AiTipAudience | null {
  if (facts.hasAiPlan) return null
  if (facts.aiUsed30d >= AI_TIP_HEAVY_USE) return null
  if (facts.lastTipDate !== null && dayIndex(today) - dayIndex(facts.lastTipDate) < AI_TIP_INTERVAL_DAYS) return null
  return facts.aiUsed30d === 0 ? 'new' : 'tried'
}

interface Row { [key: string]: unknown }
interface Result { data: Row[] | null; count?: number | null; error: { message: string } | null }
// supabase-js sorgu zinciri; index.ts'teki service role istemcisi bunu karşılar.
interface Query extends PromiseLike<Result> {
  eq(column: string, value: unknown): Query
  gte(column: string, value: unknown): Query
  order(column: string, options: { ascending: boolean }): Query
  limit(count: number): Query
}
export interface AiTipDb {
  from(table: string): {
    select(columns: string, options?: { count: 'exact'; head: true }): Query
  }
}

/** Hata fırlatır: çağıran satırı atlar, bildirimin geri kalanı yine gider. */
export async function loadAiTipFacts(db: AiTipDb, uid: string, now: Date = new Date()): Promise<AiTipFacts> {
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString()

  const sub = await db.from('subscriptions').select('status, current_period_end, period_type').eq('user_id', uid).limit(1)
  if (sub.error) throw new Error(sub.error.message)
  const row = sub.data?.[0]
  const periodEnd = typeof row?.['current_period_end'] === 'string' ? row['current_period_end'] : null
  const paid = row?.['status'] === 'pro_monthly' || row?.['status'] === 'pro_annual'
  const hasAiPlan = (paid && periodEnd !== null && new Date(periodEnd) > now) || row?.['period_type'] === 'trial'

  const used = await db.from('events').select('id', { count: 'exact', head: true })
    .eq('user_id', uid).eq('name', 'ai_used').gte('created_at', since)
  if (used.error) throw new Error(used.error.message)

  const last = await db.from('notification_log').select('local_date')
    .eq('user_id', uid).eq('kind', AI_TIP_LOG_KIND).order('local_date', { ascending: false }).limit(1)
  if (last.error) throw new Error(last.error.message)
  const lastDate = last.data?.[0]?.['local_date']

  return {
    hasAiPlan,
    aiUsed30d: used.count ?? 0,
    lastTipDate: typeof lastDate === 'string' ? lastDate : null,
  }
}
