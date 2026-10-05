// Gün raporunun kullanıcıya bağlı iki girdisi: saat dilimi ve program ilerlemesi.

import type { Db } from './facts.ts'
import { isValidTimeZone } from './dates.ts'

const DEFAULT_TIMEZONE = 'Europe/Istanbul'

/** Bildirim tercihlerindeki dilim, yoksa profildeki, yoksa İstanbul. Geçersiz dilim atlanır. */
export async function loadTimezone(db: Db, userId: string): Promise<string> {
  const [prefs, profile] = await Promise.all([
    db.from('notification_preferences').select('timezone').eq('user_id', userId).maybeSingle(),
    db.from('user_profiles').select('timezone').eq('id', userId).maybeSingle(),
  ])
  const candidates = [
    (prefs.data as { timezone?: unknown } | null)?.timezone,
    (profile.data as { timezone?: unknown } | null)?.timezone,
  ]
  return candidates.find(isValidTimeZone) ?? DEFAULT_TIMEZONE
}

/**
 * Kullanıcı JWT'siyle: my_routine_progress RPC'si (routine_done_count istemciye kapalı).
 * Program satırı süs: hata raporu düşürmez, yalnız program satırı çıkmaz.
 */
export async function myProgress(db: Db): Promise<Record<string, number>> {
  const { data, error } = await db.rpc('my_routine_progress')
  if (error) {
    console.error('my_routine_progress okunamadi:', error.message)
    return {}
  }
  const out: Record<string, number> = {}
  for (const row of (data ?? []) as Array<{ routine_id: string; done_count: number }>) out[row.routine_id] = row.done_count
  return out
}

/** Service role ile (cron): sayaçlı rutinlerin biten oturum sayısı, rutin başına bir RPC. */
export async function serviceProgress(db: Db, userId: string): Promise<Record<string, number>> {
  const { data, error } = await db
    .from('routines')
    .select('id')
    .eq('user_id', userId)
    .eq('is_untracked', false)
    .not('target_count', 'is', null)
  if (error) {
    console.error(`sayacli rutinler okunamadi (${userId}):`, error.message)
    return {}
  }
  const out: Record<string, number> = {}
  for (const { id } of (data ?? []) as Array<{ id: string }>) {
    const res = await db.rpc('routine_done_count', { p_routine: id })
    if (res.error) {
      console.error(`routine_done_count okunamadi (${id}):`, res.error.message)
      continue
    }
    out[id] = Number(res.data ?? 0)
  }
  return out
}
