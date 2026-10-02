// supabase/functions/ai-suggest/time.ts
// Kullanıcının saat dilimi, takvim meşguliyeti ve tarih kaydırma yardımcıları.

import type { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.2'

type Db = ReturnType<typeof createClient>

/** Kullanıcının saat dilimi (bildirim tercihleri); kayıt yoksa İstanbul. */
export async function userTimeZone(supabase: Db, userId: string): Promise<string> {
  const { data: prefs } = await supabase.from('notification_preferences').select('timezone').eq('user_id', userId).maybeSingle()
  return (prefs as { timezone?: string } | null)?.timezone ?? 'Europe/Istanbul'
}

/**
 * Google takviminden gelen dolu aralıklar (057 calendar_busy), planlayıcı çakışma
 * yapmasın diye mevcut blok gibi verilir. Başlık yok, sadece "Meşgul".
 */
export async function busyBlocks(supabase: Db, userId: string, date: string): Promise<{ start: string; end: string; label: string }[]> {
  try {
    const timeZone = await userTimeZone(supabase, userId)
    const dayStart = new Date(`${date}T00:00:00Z`).getTime() - 14 * 3600_000
    const { data } = await supabase
      .from('calendar_busy')
      .select('starts_at, ends_at')
      .eq('user_id', userId)
      .lt('starts_at', new Date(dayStart + 52 * 3600_000).toISOString())
      .gt('ends_at', new Date(dayStart).toISOString())
    const fmtDate = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    const fmtTime = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    return ((data ?? []) as { starts_at: string; ends_at: string }[]).flatMap((b) => {
      const s = new Date(b.starts_at)
      const e = new Date(b.ends_at)
      const sDay = fmtDate.format(s)
      const eDay = fmtDate.format(e)
      if (sDay > date || eDay < date) return []
      return [{
        start: sDay < date ? '00:00' : fmtTime.format(s),
        end: eDay > date ? '23:59' : fmtTime.format(e),
        label: 'Meşgul (Google Takvim)',
      }]
    })
  } catch {
    return []
  }
}

export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().split('T')[0]!
}
