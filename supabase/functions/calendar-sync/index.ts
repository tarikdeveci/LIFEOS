// calendar-sync: 5 dakikalık cron (057). Her aktif Google Calendar bağlantısı için
//   1) calendar_sync_outbox'ı işler: LifeOS takviminde etkinlik aç/güncelle/sil,
//   2) 14 günlük freebusy çeker, calendar_busy penceresini baştan yazar.
// Yalnızca kuyruktaki işi yapar; kim tetiklerse tetiklesin sonuç aynıdır.
// Google'dan başlık okunmaz; LifeOS takvimi freebusy sorgusuna dahil edilmez (yankı olmasın).

import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CAL_API = 'https://www.googleapis.com/calendar/v3'
const OUTBOX_BATCH = 50
const MAX_ATTEMPTS = 5
const BUSY_DAYS = 14

interface IntegrationRow {
  id: string
  user_id: string
  settings: { calendar_id?: string } | null
}

interface OutboxRow {
  id: number
  block_id: string | null
  op: 'upsert' | 'delete'
  google_event_id: string | null
  attempts: number
}

interface BlockRow {
  id: string
  date: string
  start_time: string
  end_time: string
  label: string | null
  block_type: string
  completed_at: string | null
  google_event_id: string | null
}

class RevokedError extends Error {}

async function accessToken(integrationId: string): Promise<string> {
  const { data: secret, error } = await supabase.rpc('integration_get_secret', { p_integration: integrationId })
  if (error || typeof secret !== 'string') throw new Error('secret okunamadı')
  const { refresh_token } = JSON.parse(secret) as { refresh_token?: string }
  if (!refresh_token) throw new RevokedError('refresh token yok')

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const body = (await res.json()) as { access_token?: string; error?: string }
  if (body.error === 'invalid_grant') throw new RevokedError('invalid_grant')
  if (!res.ok || !body.access_token) throw new Error(`token yenilenemedi (${res.status})`)
  return body.access_token
}

async function userTimeZone(userId: string): Promise<string> {
  const { data } = await supabase
    .from('notification_preferences')
    .select('timezone')
    .eq('user_id', userId)
    .maybeSingle()
  return (data as { timezone?: string } | null)?.timezone ?? 'Europe/Istanbul'
}

function eventBody(block: BlockRow, timeZone: string) {
  // Gece yarısını aşan blok (end <= start) gün sonunda biter.
  const end = block.end_time > block.start_time ? block.end_time : '23:59:00'
  return {
    summary: `${block.completed_at ? '✓ ' : ''}${block.label ?? 'LifeOS'}`,
    start: { dateTime: `${block.date}T${block.start_time.slice(0, 8).padEnd(8, ':00')}`, timeZone },
    end: { dateTime: `${block.date}T${end.slice(0, 8).padEnd(8, ':00')}`, timeZone },
    source: { title: 'LifeOS', url: 'https://lifeos.tr/planning' },
    extendedProperties: { private: { lifeos_block_id: block.id } },
  }
}

async function gcal(token: string, method: string, path: string, body?: unknown): Promise<Response> {
  return await fetch(`${CAL_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

async function processOutbox(integration: IntegrationRow, token: string, timeZone: string): Promise<number> {
  const calendarId = integration.settings?.calendar_id
  if (!calendarId) throw new Error('LifeOS takvimi yok')
  const cal = encodeURIComponent(calendarId)

  const { data: rows } = await supabase
    .from('calendar_sync_outbox')
    .select('id, block_id, op, google_event_id, attempts')
    .eq('user_id', integration.user_id)
    .order('id')
    .limit(OUTBOX_BATCH)

  let done = 0
  for (const row of (rows ?? []) as OutboxRow[]) {
    try {
      if (row.op === 'delete') {
        if (row.google_event_id) {
          const res = await gcal(token, 'DELETE', `/calendars/${cal}/events/${encodeURIComponent(row.google_event_id)}`)
          if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`delete ${res.status}`)
        }
      } else {
        const { data: block } = await supabase
          .from('time_blocks')
          .select('id, date, start_time, end_time, label, block_type, completed_at, google_event_id')
          .eq('id', row.block_id)
          .maybeSingle()
        // Blok bu arada silindiyse delete işi zaten kuyrukta.
        if (block) {
          const b = block as BlockRow
          const eventId = b.google_event_id
          let res = eventId
            ? await gcal(token, 'PATCH', `/calendars/${cal}/events/${encodeURIComponent(eventId)}`, eventBody(b, timeZone))
            : null
          if (!res || res.status === 404 || res.status === 410) {
            res = await gcal(token, 'POST', `/calendars/${cal}/events`, eventBody(b, timeZone))
          }
          if (!res.ok) throw new Error(`upsert ${res.status}`)
          const created = (await res.json()) as { id: string }
          if (created.id !== eventId) {
            await supabase.rpc('set_block_google_event', { p_block: b.id, p_event: created.id })
          }
        }
      }
      await supabase.from('calendar_sync_outbox').delete().eq('id', row.id)
      done++
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown'
      if (row.attempts + 1 >= MAX_ATTEMPTS) {
        await supabase.from('calendar_sync_outbox').delete().eq('id', row.id)
      } else {
        await supabase.from('calendar_sync_outbox').update({ attempts: row.attempts + 1, last_error: message }).eq('id', row.id)
      }
    }
  }
  return done
}

async function refreshBusy(integration: IntegrationRow, token: string, timeZone: string): Promise<void> {
  const timeMin = new Date()
  timeMin.setUTCHours(0, 0, 0, 0)
  timeMin.setUTCDate(timeMin.getUTCDate() - 1)
  const timeMax = new Date(timeMin.getTime() + (BUSY_DAYS + 1) * 86400000)

  const res = await gcal(token, 'POST', '/freeBusy', {
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    timeZone,
    items: [{ id: 'primary' }],
  })
  if (!res.ok) throw new Error(`freebusy ${res.status}`)
  const body = (await res.json()) as { calendars?: Record<string, { busy?: { start: string; end: string }[] }> }
  const busy = body.calendars?.['primary']?.busy ?? []

  await supabase.from('calendar_busy').delete().eq('user_id', integration.user_id)
  if (busy.length > 0) {
    await supabase.from('calendar_busy').insert(
      busy.map((b) => ({ user_id: integration.user_id, starts_at: b.start, ends_at: b.end })),
    )
  }
}

Deno.serve(async () => {
  const { data: integrations, error } = await supabase
    .from('integrations')
    .select('id, user_id, settings')
    .eq('provider', 'google_calendar')
    .eq('status', 'active')

  if (error) return new Response(`DB error: ${error.message}`, { status: 500 })

  let synced = 0
  let failed = 0
  for (const integration of (integrations ?? []) as IntegrationRow[]) {
    try {
      const token = await accessToken(integration.id)
      const timeZone = await userTimeZone(integration.user_id)
      await processOutbox(integration, token, timeZone)
      await refreshBusy(integration, token, timeZone)
      await supabase.from('integrations')
        .update({ last_synced_at: new Date().toISOString(), last_error: null })
        .eq('id', integration.id)
      synced++
    } catch (err) {
      failed++
      // Sadece iptal edilmiş izin bağlantıyı düşürür; geçici hatada aktif kalır, sonraki
      // turda yeniden denenir (status 'error' olsaydı cron bir daha hiç seçmezdi).
      const revoked = err instanceof RevokedError
      await supabase.from('integrations')
        .update({ ...(revoked ? { status: 'revoked' } : {}), last_error: err instanceof Error ? err.message.slice(0, 500) : 'unknown' })
        .eq('id', integration.id)
    }
  }

  return new Response(JSON.stringify({ synced, failed }), { headers: { 'Content-Type': 'application/json' } })
})
