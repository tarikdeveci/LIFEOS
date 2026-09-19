import { createHash } from 'node:crypto'
// Kök '@lifeos/shared' React hook'larını da içeri alır; sunucu rotası alt yoldan okur
import { BLOCK_TYPE_LABELS } from '@lifeos/shared/constants'
import type { BlockType } from '@lifeos/shared/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { addDays, buildCalendar, localDate, safeTimeZone, type FeedBlock } from '@/lib/calendar/ics'

// node:crypto ve service-role client gerektirir; her istek taze veri döner.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 32 byte base64url
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
const PAST_DAYS = 30
const FUTURE_DAYS = 90

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function notFound(): Response {
  return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

function blockTitle(row: Record<string, unknown>): string {
  // PostgREST tekil ilişkiyi nesne olarak döner; yine de dizi gelirse ilkini al
  const task: unknown = Array.isArray(row['task']) ? row['task'][0] : row['task']
  const taskTitle = task && typeof task === 'object' ? (task as Record<string, unknown>)['title'] : null
  if (typeof taskTitle === 'string' && taskTitle.trim()) return taskTitle.trim()
  const label = row['label']
  if (typeof label === 'string' && label.trim()) return label.trim()
  const type = row['block_type']
  return typeof type === 'string' && type in BLOCK_TYPE_LABELS ? BLOCK_TYPE_LABELS[type as BlockType] : 'LifeOS'
}

function toFeedBlock(row: Record<string, unknown>): FeedBlock | null {
  const { id, date, start_time: start, end_time: end } = row
  if (typeof id !== 'string' || typeof date !== 'string' || typeof start !== 'string' || typeof end !== 'string') return null
  return {
    id, date, start, end,
    title: blockTitle(row),
    category: typeof row['block_type'] === 'string' ? row['block_type'] : 'task',
    completed: row['completed_at'] != null,
    updatedAt: typeof row['updated_at'] === 'string' ? row['updated_at'] : null,
  }
}

/**
 * Takvim aboneliği: Google Calendar, Outlook ve Apple Takvim bu adresi
 * periyodik olarak çeker. Kimlik, linkteki token (ayarlar > entegrasyonlar).
 * Geçmiş 30 ve gelecek 90 günün zaman blokları döner.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/, '')
  if (!TOKEN_RE.test(token)) return notFound()

  const admin = createAdminClient()
  const { data: feed, error: feedError } = await admin
    .from('calendar_feeds')
    .select('user_id')
    .eq('token_hash', sha256(token))
    .maybeSingle()

  if (feedError) {
    console.error('calendar feed: token sorgu hatası', feedError)
    return new Response('Server error', { status: 500 })
  }
  if (!feed) return notFound()

  const userId = feed.user_id as string
  // Mobil uygulama cihaz saat dilimini buraya yazar; bildirimler de bunu kullanır
  const { data: prefs } = await admin
    .from('notification_preferences')
    .select('timezone')
    .eq('user_id', userId)
    .maybeSingle()
  const timeZone = safeTimeZone(prefs?.timezone)

  const now = new Date()
  const today = localDate(now, timeZone)
  const { data: rows, error: blocksError } = await admin
    .from('time_blocks')
    .select('id, date, start_time, end_time, block_type, label, completed_at, updated_at, task:tasks(title)')
    .eq('user_id', userId)
    .gte('date', addDays(today, -PAST_DAYS))
    .lte('date', addDays(today, FUTURE_DAYS))
    .order('date')
    .order('start_time')

  if (blocksError) {
    console.error('calendar feed: blok sorgu hatası', blocksError)
    return new Response('Server error', { status: 500 })
  }

  await admin.from('calendar_feeds').update({ last_fetched_at: now.toISOString() }).eq('user_id', userId)

  const origin = new URL(req.url).origin
  const body = buildCalendar({
    name: 'LifeOS',
    timeZone,
    url: `${origin}/planning`,
    blocks: ((rows ?? []) as Record<string, unknown>[]).flatMap((row) => toFeedBlock(row) ?? []),
    now,
  })

  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="lifeos.ics"',
      'Cache-Control': 'private, max-age=300',
    },
  })
}
