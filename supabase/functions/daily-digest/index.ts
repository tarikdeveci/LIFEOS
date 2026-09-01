// supabase/functions/daily-digest/index.ts
// Her saat başı pg_cron tarafından çağrılır.
// Kullanıcının yerel saatine göre üç slottan birini gönderir:
//   sabah  (digest_hour)  → günün planı
//   öğlen  (midday_hour)  → kalan bloklar + kalori durumu
//   akşam  (evening_hour) → günün beslenme özeti
import { createClient } from 'npm:@supabase/supabase-js@2'

import { type PushMessage, type PushSupabase, sendExpoPush } from '../_shared/push.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

type Slot = 'morning' | 'midday' | 'evening'

// Kullanıcının kendi saat diliminde şu anki tarih/saat.
// Sunucu UTC'de çalıştığı için new Date().getHours() ve toISOString() kullanılamaz:
// İstanbul'da 01:00'de UTC tarihi hâlâ dünü gösterir.
function localNow(timezone: string): { hour: number; date: string; time: string } {
  const now = new Date()
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(now)
        .map((p) => [p.type, p.value]),
    )
    return {
      hour: parseInt(parts.hour as string, 10),
      date: `${parts.year}-${parts.month}-${parts.day}`,
      time: `${parts.hour}:${parts.minute}`,
    }
  } catch {
    // Geçersiz timezone → UTC'ye düş
    return {
      hour: now.getUTCHours(),
      date: now.toISOString().slice(0, 10),
      time: now.toISOString().slice(11, 16),
    }
  }
}

async function buildMorning(uid: string, date: string, time: string) {
  const { count } = await supabase
    .from('time_blocks')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', uid)
    .eq('date', date)

  const { data: next } = await supabase
    .from('time_blocks')
    .select('label, start_time')
    .eq('user_id', uid)
    .eq('date', date)
    .gte('start_time', time)
    .order('start_time', { ascending: true })
    .limit(1)

  const first = next?.[0]
  return {
    title: `Günaydın! Bugün ${count ?? 0} blok var`,
    body: first
      ? `İlk blok: ${(first.start_time as string).slice(0, 5)} — ${first.label as string}`
      : 'Boş bir gün. Planlayıcıya göz at!',
  }
}

async function buildMidday(uid: string, date: string, time: string) {
  const { count: remaining } = await supabase
    .from('time_blocks')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', uid)
    .eq('date', date)
    .gte('start_time', time)

  const { data: meals } = await supabase
    .from('meals')
    .select('total_calories')
    .eq('user_id', uid)
    .eq('date', date)

  const kcal = (meals ?? []).reduce(
    (s: number, m: { total_calories: number | null }) => s + (m.total_calories ?? 0),
    0,
  )

  const left = remaining ?? 0
  const title = left > 0 ? `Öğlen kontrolü — ${left} blok kaldı` : 'Öğlen kontrolü'

  let body: string
  if (kcal > 0) {
    const { data: target } = await supabase
      .from('nutrition_targets')
      .select('calories')
      .eq('user_id', uid)
      .eq('is_active', true)
      .maybeSingle()

    body = `${kcal} kcal aldın`
    if (target?.calories) body += ` — hedefin %${Math.round((kcal / target.calories) * 100)}'i`
  } else {
    body = left > 0 ? 'Henüz öğün girmedin. Günün yarısı önünde.' : 'Henüz öğün girmedin.'
  }

  return { title, body }
}

async function buildEvening(uid: string, date: string) {
  const { data: meals } = await supabase
    .from('meals')
    .select('total_calories, total_protein')
    .eq('user_id', uid)
    .eq('date', date)

  // Hiç öğün yoksa akşam özeti göndermenin anlamı yok
  if (!meals || meals.length === 0) return null

  const kcal = meals.reduce(
    (s: number, m: { total_calories: number | null }) => s + (m.total_calories ?? 0),
    0,
  )
  const protein = meals.reduce(
    (s: number, m: { total_protein: number | null }) => s + (m.total_protein ?? 0),
    0,
  )

  const { data: target } = await supabase
    .from('nutrition_targets')
    .select('calories')
    .eq('user_id', uid)
    .eq('is_active', true)
    .maybeSingle()

  let body = `${kcal} kcal, ${Math.round(protein)}g protein aldın.`
  if (target?.calories) body += ` (Hedefe %${Math.round((kcal / target.calories) * 100)})`

  return { title: 'Günlük beslenme özeti', body }
}

Deno.serve(async () => {
  const { data: prefs, error } = await supabase
    .from('notification_preferences')
    .select(
      'user_id, timezone, digest_hour, digest_enabled, midday_hour, midday_enabled, evening_hour, evening_enabled',
    )

  if (error) {
    return new Response(`DB error: ${error.message}`, { status: 500 })
  }

  const pushMessages: PushMessage[] = []
  const bySlot: Record<Slot, number> = { morning: 0, midday: 0, evening: 0 }
  // Kilit push'tan önce yazılıyor; gönderim tutmazsa geri alınabilmesi için
  // kimin hangi slotu kilitlediği ve hangi token'lara yazıldığı saklanır.
  // Bir kullanıcı koşu başına tek slot alır, uid anahtar olarak yeterli.
  const locked = new Map<string, { slot: Slot; date: string; tokens: string[] }>()

  for (const pref of prefs ?? []) {
    const tz = (pref.timezone as string) ?? 'Europe/Istanbul'
    const { hour, date, time } = localNow(tz)

    // Bu saatte hangi slot düşüyor? (aynı saate iki slot ayarlanmışsa ilki kazanır)
    let slot: Slot | null = null
    if (pref.digest_enabled && hour === pref.digest_hour) slot = 'morning'
    else if (pref.midday_enabled && hour === pref.midday_hour) slot = 'midday'
    else if (pref.evening_enabled && hour === pref.evening_hour) slot = 'evening'
    if (!slot) continue

    const uid = pref.user_id as string

    const { data: tokens, error: tokensError } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', uid)

    // Hata yutulursa "token yok" ile ayırt edilemez ve kullanıcı sessizce
    // atlanır; fonksiyon yine 200 + sent:0 döner, cron başarılı sanır.
    if (tokensError) {
      console.error(`push_tokens okunamadi (${uid}):`, tokensError.message)
      continue
    }
    if (!tokens || tokens.length === 0) continue

    // Aynı token birden fazla satırda duruyorsa aynı bildirim iki kez gitmesin
    const uniqueTokens = [...new Set(tokens.map((t) => t.token as string))]

    const content = slot === 'morning'
      ? await buildMorning(uid, date, time)
      : slot === 'midday'
      ? await buildMidday(uid, date, time)
      : await buildEvening(uid, date)

    // Gönderilecek bir şey yoksa kilidi de yazma — akşam özeti öğün girilmemişse
    // null döner, o slot bugün hâlâ gönderilebilir sayılmalı.
    if (!content) continue

    // Idempotans kilidi: aynı kullanıcı + slot + yerel gün için tek gönderim.
    // Cron aynı saat içinde iki kez tetiklenirse (yeniden deneme, elle test,
    // ikinci bir zamanlayıcı) insert primary key'e çarpar ve bildirim
    // tekrarlanmaz. Push'tan hemen önce yazılır ki yarış durumunda da tutsun.
    const { error: lockError } = await supabase
      .from('notification_log')
      .insert({ user_id: uid, kind: `daily_digest_${slot}`, local_date: date })

    if (lockError) {
      // 23505 = unique_violation → bu slot bugün zaten gönderilmiş
      if (lockError.code !== '23505') {
        console.error(`notification_log insert failed for ${uid}/${slot}:`, lockError.message)
      }
      continue
    }

    for (const token of uniqueTokens) {
      pushMessages.push({
        to: token,
        title: content.title,
        body: content.body,
        data: { type: `daily_digest_${slot}` },
        sound: 'default',
      })
    }
    locked.set(uid, { slot, date, tokens: uniqueTokens })
    bySlot[slot]++
  }

  const { sent, dropped, failed } = await sendExpoPush(
    pushMessages,
    supabase as unknown as PushSupabase,
  )

  // Teslim edilemeyen digest'in kilidi kalırsa o slot bugün bir daha denenmez ve
  // bildirim büsbütün kaybolur. Bütün token'ları başarısız olan kullanıcının
  // kilidi geri alınır; saat başı koşan cron aynı saat içinde tekrar dener.
  // Silme kullanıcı bazında tek tek yapılır: `in()` listelerinin çarpımı başka
  // kullanıcıların aynı gün/slot satırlarını da silerdi.
  const failedTokens = new Set(failed)
  for (const [uid, entry] of locked) {
    if (entry.tokens.length === 0) continue
    if (!entry.tokens.every((token) => failedTokens.has(token))) continue

    bySlot[entry.slot]--
    const { error: rollbackError } = await supabase
      .from('notification_log')
      .delete()
      .eq('user_id', uid)
      .eq('kind', `daily_digest_${entry.slot}`)
      .eq('local_date', entry.date)
    if (rollbackError) console.error(`Kilit geri alinamadi (${uid}):`, rollbackError.message)
  }

  // notification_log artık blok hatırlatmalarının da kilidi: günde kullanıcı
  // başına birkaç satır yazılıyor. Saat başı çalışan tek yer burası olduğu için
  // budama da burada. Hata sonucu etkilemez — bildirim gitti bile.
  const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString()
  const { error: pruneError } = await supabase
    .from('notification_log')
    .delete()
    .lt('sent_at', cutoff)
  if (pruneError) console.error('notification_log budanamadi:', pruneError.message)

  return new Response(
    JSON.stringify({ sent, dropped, slots: bySlot }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
