// supabase/functions/event-notifications/index.ts
// Her 5 dakikada pg_cron tarafından çağrılır.
// Yaklaşan time_blocks için push bildirimi gönderir.
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

interface PushMessage {
  to: string
  title: string
  body: string
  data?: Record<string, string>
  sound?: string
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size),
  )
}

// HH:MM:SS formatındaki time_block saatini bugünün Date'ine çevirir
function blockTimeToDate(dateStr: string, timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number)
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCHours(h ?? 0, m ?? 0, 0, 0)
  return d
}

Deno.serve(async () => {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10) // YYYY-MM-DD

  // Bugünkü, bildirimi gönderilmemiş blokları çek
  const { data: blocks, error } = await supabase
    .from('time_blocks')
    .select('id, user_id, label, start_time, date, block_type')
    .eq('date', todayStr)
    .is('notification_sent_at', null)

  if (error) {
    return new Response(`DB error: ${error.message}`, { status: 500 })
  }
  if (!blocks?.length) {
    return new Response('No blocks', { status: 200 })
  }

  // Kullanıcı tercihleri (reminder_minutes) ve push token'ları çek
  const userIds = [...new Set(blocks.map((b) => b.user_id as string))]

  const [prefsResult, tokensResult] = await Promise.all([
    supabase
      .from('notification_preferences')
      .select('user_id, block_reminder_enabled, block_reminder_minutes')
      .in('user_id', userIds),
    supabase
      .from('push_tokens')
      .select('user_id, token')
      .in('user_id', userIds),
  ])

  const prefsByUser = new Map(
    (prefsResult.data ?? []).map((p) => [p.user_id as string, p]),
  )
  const tokensByUser = new Map<string, string[]>()
  for (const row of tokensResult.data ?? []) {
    const uid = row.user_id as string
    const existing = tokensByUser.get(uid) ?? []
    existing.push(row.token as string)
    tokensByUser.set(uid, existing)
  }

  const pushMessages: PushMessage[] = []
  const blockIdsToMark: string[] = []

  for (const block of blocks) {
    const uid = block.user_id as string
    const prefs = prefsByUser.get(uid)

    if (!prefs?.block_reminder_enabled) continue

    const reminderMinutes: number = prefs.block_reminder_minutes ?? 15
    const blockStart = blockTimeToDate(block.date as string, block.start_time as string)
    const notifyAt = new Date(blockStart.getTime() - reminderMinutes * 60 * 1000)

    // ±2 dakika tolerans
    if (Math.abs(notifyAt.getTime() - now.getTime()) > 2 * 60 * 1000) continue

    const tokens = tokensByUser.get(uid) ?? []
    for (const token of tokens) {
      pushMessages.push({
        to: token,
        title: `${reminderMinutes} dakika kaldı`,
        body: block.label as string,
        data: { blockId: block.id as string, type: 'block_reminder' },
        sound: 'default',
      })
    }

    blockIdsToMark.push(block.id as string)
  }

  // Bildirimi işaretlenmiş olarak güncelle
  if (blockIdsToMark.length > 0) {
    await supabase
      .from('time_blocks')
      .update({ notification_sent_at: now.toISOString() })
      .in('id', blockIdsToMark)
  }

  // Expo Push API'ye gönder (batch, max 100)
  if (pushMessages.length > 0) {
    const chunks = chunkArray(pushMessages, 100)
    for (const chunk of chunks) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      })
    }
  }

  return new Response(
    JSON.stringify({ sent: pushMessages.length, marked: blockIdsToMark.length }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
