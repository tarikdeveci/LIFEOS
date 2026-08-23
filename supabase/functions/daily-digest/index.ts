// supabase/functions/daily-digest/index.ts
// Her saat başı pg_cron tarafından çağrılır.
// Kullanıcının yerel saatine göre üç slottan birini gönderir:
//   sabah  (digest_hour)  → günün planı
//   öğlen  (midday_hour)  → kalan bloklar + kalori durumu
//   akşam  (evening_hour) → günün beslenme özeti
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

type Slot = 'morning' | 'midday' | 'evening'

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

    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', uid)

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
    bySlot[slot]++
  }

  if (pushMessages.length > 0) {
    for (const chunk of chunkArray(pushMessages, 100)) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      })
    }
  }

  return new Response(
    JSON.stringify({ sent: pushMessages.length, slots: bySlot }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
