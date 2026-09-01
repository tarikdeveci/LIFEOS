// supabase/functions/event-notifications/index.ts
// Her 5 dakikada pg_cron tarafından çağrılır.
// Yaklaşan time_blocks için push bildirimi gönderir.
import { createClient } from 'npm:@supabase/supabase-js@2'

import { type PushMessage, type PushSupabase, sendExpoPush } from '../_shared/push.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

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

  // Bu iki sorgunun hatası yutulursa fonksiyon sessizce HİÇBİR bildirim
  // göndermez ve yine de 200 + sent:0 döner — cron başarılı sanır. Bildirim
  // hattını aylarca sessiz bırakan tam olarak bu kalıptı; burada gürültü çıkarıyoruz.
  if (prefsResult.error || tokensResult.error) {
    const message = prefsResult.error?.message ?? tokensResult.error?.message ?? 'bilinmeyen hata'
    console.error('Tercih/token sorgusu basarisiz:', message)
    return new Response(`DB error: ${message}`, { status: 500 })
  }

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

  interface DueBlock {
    id: string
    userId: string
    label: string
    startTime: string
    date: string
    minutesLeft: number
  }

  const dueByUser = new Map<string, DueBlock[]>()

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
    // Artık "vakti gelmiş ve henüz gönderilmemiş" olan her şeyi alıyoruz.
    // 10 dakikadan eskiler bayat sayılır.
    const dueMs = now.getTime() - notifyAt.getTime()
    if (dueMs < 0 || dueMs > 10 * 60 * 1000) continue

    const existing = dueByUser.get(uid) ?? []
    existing.push({
      id: block.id as string,
      userId: uid,
      label: block.label as string,
      startTime: (block.start_time as string).slice(0, 5),
      date: block.date as string,
      // Gerçek kalan süre — gecikmeli çalışmada "15 dakika kaldı" yazmasın
      minutesLeft: Math.max(0, Math.round((blockStart.getTime() - now.getTime()) / 60_000)),
    })
    dueByUser.set(uid, existing)
  }

  // Idempotans kilidi. 10 dakikalık pencere 5 dakikalık cron'un ÜÇ koşusuna
  // birden denk gelir; tekrarı engelleyen tek şey notification_sent_at yazısıydı
  // ve o yazı push'tan sonra, hatası hiç kontrol edilmeden yapılıyordu. Yazı
  // tutmazsa ya da iki koşu üst üste binerse aynı hatırlatma üç kez gidiyordu.
  //
  // Artık kilit veritabanının kendisinde: (user_id, kind, local_date) birincil
  // anahtarına ON CONFLICT DO NOTHING ile yazılır ve YALNIZCA gerçekten eklenen
  // satırlar geri döner. İkinci koşu sıfır satır iddia eder, sıfır bildirim gönderir.
  const allDue = [...dueByUser.values()].flat()
  if (allDue.length === 0) {
    return new Response(JSON.stringify({ sent: 0, marked: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { data: claimed, error: claimError } = await supabase
    .from('notification_log')
    .upsert(
      allDue.map((block) => ({
        user_id: block.userId,
        kind: `block_${block.id}`,
        local_date: block.date,
      })),
      { onConflict: 'user_id,kind,local_date', ignoreDuplicates: true },
    )
    .select('kind')

  // Kilit yazılamıyorsa (örn. 031 migration'ı henüz uygulanmamış) hatırlatmaları
  // TAMAMEN susturmak yanlış olurdu: eksik bildirim, çift bildirimden kötüdür.
  // Böyle bir durumda eski davranışa düşülür — koruma yine notification_sent_at
  // olur — ama durum hem loglanır hem de yanıt gövdesinde görünür.
  const lockAvailable = !claimError
  if (claimError) console.error('notification_log kilidi kullanilamadi:', claimError.message)

  const claimedIds = lockAvailable
    ? new Set((claimed ?? []).map((row) => (row.kind as string).replace(/^block_/, '')))
    : new Set(allDue.map((block) => block.id))

  const pushMessages: PushMessage[] = []
  // Gönderim sonucu ancak push'tan sonra bilindiği için kimin hangi bloklara
  // sahip olduğu burada tutulur; işaretleme ve geri alma buna göre yapılır.
  const claimedByUser = new Map<string, DueBlock[]>()

  for (const [uid, list] of dueByUser) {
    const mine = list.filter((block) => claimedIds.has(block.id))
    if (mine.length === 0) continue

    mine.sort((a, b) => a.startTime.localeCompare(b.startTime))
    claimedByUser.set(uid, mine)

    // Aynı koşuda birden çok blok düşüyorsa tek bildirim gönderilir. Blok başına
    // ayrı push, sabah üst üste kurulmuş bir programda bildirim yığını demekti.
    const first = mine[0]!
    const single = mine.length === 1
    // Tip açıkça yazılmalı: iki dalın birleşimi çıkarıldığında TypeScript ikinci
    // dala `blockId?: undefined` ekler ve bu, Record<string, string>'e oturmaz.
    const content: { title: string; body: string; data: Record<string, string> } = single
      ? {
        title: first.minutesLeft > 0 ? `${first.minutesLeft} dakika kaldı` : 'Şimdi başlıyor',
        body: first.label,
        data: { blockId: first.id, type: 'block_reminder' },
      }
      : {
        title: `${mine.length} blok yaklaşıyor`,
        body: mine.map((block) => `${block.startTime} ${block.label}`).join(' · '),
        data: { type: 'block_reminder' },
      }

    // Aynı token birden fazla satırda duruyorsa hatırlatma iki kez gitmesin
    for (const token of new Set(tokensByUser.get(uid) ?? [])) {
      pushMessages.push({ to: token, ...content, sound: 'default' })
    }
  }

  const { sent, dropped, failed } = await sendExpoPush(
    pushMessages,
    supabase as unknown as PushSupabase,
  )

  // Kilit gönderimden ÖNCE yazıldığı için teslim edilemeyen hatırlatma kilitli
  // kalır ve bir daha hiç denenmez. Bütün token'ları başarısız olan kullanıcının
  // kilidi geri alınır: sonraki koşu (blok hâlâ 10 dakikalık pencerede olduğu
  // sürece) yeniden dener. Token'ı hiç olmayan kullanıcı başarısız sayılmaz —
  // gönderilecek bir şey yoktu, tekrar denemenin anlamı yok.
  const failedTokens = new Set(failed)
  const delivered: string[] = []
  const retry: DueBlock[] = []

  for (const [uid, mine] of claimedByUser) {
    const tokens = [...new Set(tokensByUser.get(uid) ?? [])]
    const allFailed = tokens.length > 0 && tokens.every((token) => failedTokens.has(token))
    if (allFailed) retry.push(...mine)
    else delivered.push(...mine.map((block) => block.id))
  }

  if (lockAvailable && retry.length > 0) {
    const { error: rollbackError } = await supabase
      .from('notification_log')
      .delete()
      .in('kind', retry.map((block) => `block_${block.id}`))
    if (rollbackError) console.error('Kilit geri alinamadi:', rollbackError.message)
  }

  // Bildirimi işaretlenmiş olarak güncelle — kilit artık notification_log'da,
  // bu yazı yalnızca sonraki koşuların aynı satırları boşuna taramasını önler.
  if (delivered.length > 0) {
    const { error: markError } = await supabase
      .from('time_blocks')
      .update({ notification_sent_at: now.toISOString() })
      .in('id', delivered)
    if (markError) console.error('notification_sent_at yazilamadi:', markError.message)
  }

  return new Response(
    JSON.stringify({
      sent,
      dropped,
      marked: delivered.length,
      retry: retry.length,
      lock: lockAvailable,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
