// supabase/functions/daily-report/index.ts
// Gün raporu: kullanıcı JWT'siyle çağrılır, AI yok, ücretsiz.
//
// İstek:  { date: 'YYYY-MM-DD', language?: 'tr' | 'en', checkin?: DayCheckin, opened?: boolean }
// Yanıt:  { report: DailyReport }
//
// Tarih kullanıcının saat diliminde bugünse olgular yeniden hesaplanır. Geçmiş günde
// satır varsa öğe listesi donuktur, yalnız sonuçlar tazelenir (_shared/report/store.ts).
// Bugünden önceki gün için satır yoksa 404 (report_not_found). Bir günden fazla gelecek
// tarih ve 30 günden eski tarih 400; bir gün ilerisi (cihaz dilimi) bugüne sıkıştırılır.

import { createClient } from 'npm:@supabase/supabase-js@2'

import { parseCheckin } from '../_shared/report/checkin.ts'
import { isIsoDate, localDateIn, resolveReportDate } from '../_shared/report/dates.ts'
import { ReportNotFoundError, refreshReport } from '../_shared/report/store.ts'
import type { ReportLanguage } from '../_shared/report/text.ts'
import type { DayCheckin } from '../_shared/report/types.ts'
import { loadTimezone, myProgress } from '../_shared/report/userData.ts'

const ALLOWED_ORIGINS = ['http://localhost:3000', 'http://localhost:3001', 'https://lifeos.tr', 'https://www.lifeos.tr']
/** Bundan eski günün raporu istenemez. */
const MAX_AGE_DAYS = 30

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]!,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
  }
}

interface ReportRequest {
  date?: unknown
  language?: unknown
  checkin?: unknown
  opened?: unknown
}

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req)
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })

  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization) return json({ error: 'Oturum gerekli' }, 401)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } },
    })
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return json({ error: 'Geçersiz oturum' }, 401)

    let body: ReportRequest
    try {
      body = (await req.json()) as ReportRequest
    } catch {
      return json({ error: 'Geçersiz istek gövdesi' }, 400)
    }

    if (!isIsoDate(body.date)) return json({ error: 'date YYYY-MM-DD olmalı' }, 400)

    const timezone = await loadTimezone(supabase, user.id)
    const today = localDateIn(timezone, new Date())
    // Cihaz dilimi sunucunun bildiğinden ileride olabilir: bir gün ilerisi bugüne sıkıştırılır.
    const checked = resolveReportDate(body.date, today, MAX_AGE_DAYS)
    if (!checked.ok) {
      return json({ error: checked.reason === 'future' ? 'Gelecek tarih için rapor yok' : `${MAX_AGE_DAYS} günden eski rapor istenemez` }, 400)
    }
    const { date } = checked

    let checkin: DayCheckin | undefined
    if (body.checkin !== undefined && body.checkin !== null) {
      const parsed = parseCheckin(body.checkin)
      if (!parsed) return json({ error: 'Geçersiz kapanış' }, 400)
      checkin = parsed
    }

    const language: ReportLanguage = body.language === 'en' ? 'en' : 'tr'
    const report = await refreshReport(supabase, {
      userId: user.id,
      date,
      today,
      timezone,
      language,
      progress: await myProgress(supabase),
      checkin,
      opened: body.opened === true,
    })
    return json({ report })
  } catch (error) {
    if (error instanceof ReportNotFoundError) return json({ error: 'Rapor bulunamadı', code: 'report_not_found' }, 404)
    console.error('daily-report error:', error instanceof Error ? error.message : error)
    return json({ error: 'Gün raporu oluşturulurken hata oluştu' }, 500)
  }
})
