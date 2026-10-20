// supabase/functions/_shared/ai/fallbackNotice.ts
//
// Aylik AI butcesi dolup kullanici hafif (yedek) modele gectiginde ayda BIR kez
// push bildirimi. "Bu ay bildirildi" kilidi events tablosundaki
// `ai_fallback_notified` satiridir; push dusarsa kilit silinir ki bir sonraki
// istek yeniden denesin.

import { sendExpoPush, type PushMessage } from '../push.ts'

export type NoticeLang = 'tr' | 'en'
export type NoticeResult = 'sent' | 'skipped' | 'failed'

interface QueryError {
  message: string
}

interface Query extends PromiseLike<{ data?: unknown; error: QueryError | null }> {
  eq(column: string, value: string): Query
  gte(column: string, value: string): Query
  in(column: string, values: readonly string[]): Query
  limit(count: number): Query
}

/**
 * service role istemcisinin kullandigimiz kismi. Yapisal tip: bu dosya
 * cagiranin supabase-js surumune baglanmasin (push.ts ile ayni gerekce).
 */
export interface NoticeClient {
  from(table: string): {
    select(columns: string): Query
    insert(row: Record<string, unknown>): PromiseLike<{ error: QueryError | null }>
    delete(): Query
  }
}

const NOTICE_EVENT = 'ai_fallback_notified'

const MONTHS = {
  tr: ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
} as const

/** Yenilenme tarihi: bir sonraki UTC ayinin 1'i. Sunucu UTC'de, butce de UTC ay penceresinde. */
export function fallbackNoticeCopy(lang: NoticeLang, now: Date): { title: string; body: string } {
  const nextMonth = MONTHS[lang][(now.getUTCMonth() + 1) % 12]!
  if (lang === 'en') {
    return {
      title: 'Switched to light AI mode',
      body: `Your fast AI allowance for this month is used up. Your AI features keep working with a lighter model until the end of the month. Renews: ${nextMonth} 1.`,
    }
  }
  return {
    title: 'Hafif AI moduna geçtin',
    body: `Bu ayki hızlı AI kullanımın doldu. AI özelliklerin çalışmaya devam ediyor, ay sonuna kadar daha hafif bir modelle. Yenilenme: 1 ${nextMonth}.`,
  }
}

function monthStartIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

/**
 * Bu ay daha once bildirilmediyse kullanicinin her token'ina bir push gonderir.
 * ASLA firlatmaz: bildirim, asil AI istegini dusurmemeli.
 */
export async function notifyFallbackOnce(
  admin: NoticeClient,
  userId: string,
  lang: NoticeLang,
  now: Date = new Date(),
): Promise<NoticeResult> {
  const since = monthStartIso(now)
  let locked = false

  const unlock = async () => {
    if (!locked) return
    try {
      await admin.from('events').delete().eq('user_id', userId).eq('name', NOTICE_EVENT).gte('created_at', since)
    } catch (error) {
      console.error('ai_fallback_notified kilidi silinemedi:', error)
    }
  }

  try {
    const existing = await admin
      .from('events')
      .select('id')
      .eq('user_id', userId)
      .eq('name', NOTICE_EVENT)
      .gte('created_at', since)
      .limit(1)
    if (existing.error) {
      console.error('ai_fallback_notified okunamadi:', existing.error.message)
      return 'failed'
    }
    if (Array.isArray(existing.data) && existing.data.length > 0) return 'skipped'

    const inserted = await admin.from('events').insert({ user_id: userId, name: NOTICE_EVENT })
    if (inserted.error) {
      console.error('ai_fallback_notified yazilamadi:', inserted.error.message)
      return 'failed'
    }
    locked = true

    const tokenRows = await admin.from('push_tokens').select('token').eq('user_id', userId)
    if (tokenRows.error) {
      console.error('push_tokens okunamadi:', tokenRows.error.message)
      await unlock()
      return 'failed'
    }
    const tokens = (Array.isArray(tokenRows.data) ? tokenRows.data : [])
      .map((row) => (row as { token?: unknown }).token)
      .filter((token): token is string => typeof token === 'string' && token.length > 0)
    if (tokens.length === 0) return 'skipped'

    const copy = fallbackNoticeCopy(lang, now)
    const messages: PushMessage[] = tokens.map((to) => ({
      to,
      title: copy.title,
      body: copy.body,
      data: { type: 'ai_fallback' },
      sound: 'default',
    }))
    const result = await sendExpoPush(messages, admin)
    if (result.sent === 0 && result.failed.length > 0) {
      await unlock()
      return 'failed'
    }
    return result.sent > 0 ? 'sent' : 'skipped'
  } catch (error) {
    console.error('yedek mod bildirimi hatasi:', error)
    await unlock()
    return 'failed'
  }
}
