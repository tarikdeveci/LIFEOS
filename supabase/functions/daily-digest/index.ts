// supabase/functions/daily-digest/index.ts
// Her saat başı pg_cron tarafından çağrılır.
// Kullanıcı yerel saatine göre günlük özet bildirimi gönderir.
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

function getUserLocalHour(timezone: string): number {
  try {
    const hourStr = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).format(new Date())
    return parseInt(hourStr, 10)
  } catch {
    return new Date().getUTCHours()
  }
}

Deno.serve(async () => {
  const { data: prefs, error } = await supabase
    .from('notification_preferences')
    .select('user_id, digest_hour, timezone, digest_enabled')
    .eq('digest_enabled', true)

  if (error) {
    return new Response(`DB error: ${error.message}`, { status: 500 })
  }

  const pushMessages: PushMessage[] = []
  const today = new Date().toISOString().slice(0, 10)

  for (const pref of prefs ?? []) {
    const localHour = getUserLocalHour(pref.timezone as string)
    if (localHour !== (pref.digest_hour as number)) continue

    const uid = pref.user_id as string

    // Bugünkü tamamlanmamış blok sayısı
    const { count: blockCount } = await supabase
      .from('time_blocks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', uid)
      .eq('date', today)

    // İlk yaklaşan blok
    const now = new Date()
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const { data: nextBlocks } = await supabase
      .from('time_blocks')
      .select('label, start_time')
      .eq('user_id', uid)
      .eq('date', today)
      .gte('start_time', nowTime)
      .order('start_time', { ascending: true })
      .limit(1)

    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', uid)

    const firstBlock = nextBlocks?.[0]
    const blockTime = firstBlock
      ? (firstBlock.start_time as string).slice(0, 5)
      : null

    const total = blockCount ?? 0

    for (const { token } of tokens ?? []) {
      pushMessages.push({
        to: token as string,
        title: `Günaydın! Bugün ${total} blok var`,
        body: firstBlock
          ? `İlk blok: ${blockTime} — ${firstBlock.label as string}`
          : 'Boş bir gün. Planlayıcıya göz at!',
        data: { type: 'daily_digest' },
        sound: 'default',
      })
    }
  }

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
    JSON.stringify({ sent: pushMessages.length }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
