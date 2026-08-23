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

// Geçersiz bir timezone Intl.DateTimeFormat'ta RangeError atar. Tek bir bozuk
// kayıt yüzünden döngü patlarsa o koşuda HİÇBİR kullanıcı bildirim alamaz;
// bu yüzden bilinmeyen değerler sessizce UTC'ye düşer.
const tzCache = new Map<string, string>()
function safeTimeZone(tz: string): string {
  const cached = tzCache.get(tz)
  if (cached) return cached
  let resolved = 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date())
    resolved = tz
  } catch {
    console.warn(`Gecersiz timezone: ${tz} — UTC kullaniliyor`)
  }
  tzCache.set(tz, resolved)
  return resolved
}

// Verilen anın hedef saat diliminde UTC'ye göre kaç ms ötede olduğu.
function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  )
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return asIfUtc - instant.getTime()
}

// time_blocks.date + start_time kullanıcının YEREL duvar saatidir.
// Bunu gerçek UTC anına çevirir. Eskiden yerel saat doğrudan UTC sanılıyordu:
// İstanbul'da 09:00'a kurulan blok 09:00 UTC = 12:00 yerel olarak hesaplanıyor,
// hatırlatma tam 3 saat geç gidiyordu.
function localWallTimeToInstant(dateStr: string, timeStr: string, rawTimeZone: string): Date {
  const timeZone = safeTimeZone(rawTimeZone)
  const [h, m] = timeStr.split(':').map(Number)
  const [y, mo, d] = dateStr.split('-').map(Number) as [number, number, number]
  // Yerel duvar saatini önce "UTC'ymiş gibi" kur, sonra tz farkını düş.
  const naive = Date.UTC(y, mo - 1, d, h ?? 0, m ?? 0, 0, 0)
  // Tek geçiş çoğu durumda yeter; ikinci geçiş DST sınırındaki kaymayı düzeltir.
  let instant = new Date(naive - tzOffsetMs(new Date(naive), timeZone))
  instant = new Date(naive - tzOffsetMs(instant, timeZone))
  return instant
}

function utcDateStr(instant: Date, offsetDays = 0): string {
  return new Date(instant.getTime() + offsetDays * 86400_000).toISOString().slice(0, 10)
}

Deno.serve(async () => {
  const now = new Date()

  // Kullanıcılar farklı saat dilimlerinde olabilir; UTC "bugün" onların bugünüyle
  // örtüşmeyebilir (İstanbul'da 01:00 iken UTC hâlâ dün). ±1 günlük pencere çekip
  // asıl filtrelemeyi hesaplanan UTC anına göre yapıyoruz.
  const { data: blocks, error } = await supabase
    .from('time_blocks')
    .select('id, user_id, label, start_time, date, block_type')
    .gte('date', utcDateStr(now, -1))
    .lte('date', utcDateStr(now, 1))
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
      .select('user_id, block_reminder_enabled, block_reminder_minutes, timezone')
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
    const tz = (prefs.timezone as string) || 'Europe/Istanbul'
    const blockStart = localWallTimeToInstant(
      block.date as string,
      block.start_time as string,
      tz,
    )
    const notifyAt = new Date(blockStart.getTime() - reminderMinutes * 60 * 1000)

    // Cron 5 dakikada bir çalışıyor. Eski ±2 dakikalık pencere cron aralığının
    // yarısından dardı: araya denk gelen hatırlatmalar hiç gönderilmiyordu.
    // Artık "vakti gelmiş ve henüz gönderilmemiş" olan her şeyi alıyoruz;
    // tekrarı notification_sent_at engelliyor. 10 dakikadan eskiler bayat sayılır.
    const dueMs = now.getTime() - notifyAt.getTime()
    if (dueMs < 0 || dueMs > 10 * 60 * 1000) continue

    // Gerçek kalan süre — gecikmeli çalışmada "15 dakika kaldı" yazmasın
    const minutesLeft = Math.max(0, Math.round((blockStart.getTime() - now.getTime()) / 60_000))

    // Aynı token birden fazla satırda duruyorsa hatırlatma iki kez gitmesin
    const tokens = [...new Set(tokensByUser.get(uid) ?? [])]
    for (const token of tokens) {
      pushMessages.push({
        to: token,
        title: minutesLeft > 0 ? `${minutesLeft} dakika kaldı` : 'Şimdi başlıyor',
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
