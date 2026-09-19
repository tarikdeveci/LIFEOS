// supabase/functions/daily-digest/index.ts
// Her saat başı pg_cron tarafından çağrılır.
// Kullanıcının yerel saatine göre üç slottan birini gönderir:
//   sabah  (digest_hour)  → günün planı
//   öğlen  (midday_hour)  → kalan bloklar + kalori durumu
//   akşam  (evening_hour) → günün beslenme özeti
// Ayrıca tartı hatırlatması (weight_hour): o gün tartı yoksa gider. Başka bir
// slotla aynı saate düşerse o bildirime tek satır olarak eklenir.
// Metinler copy.ts'te: her gün değişir, veriye ve haftanın gününe göre seçilir.
import { createClient } from 'npm:@supabase/supabase-js@2'

import { type PushMessage, type PushSupabase, sendExpoPush } from '../_shared/push.ts'
import { computeStreak, type StreakSummary } from '../_shared/streak.ts'
import {
  type Copy,
  type DayContext,
  type WeightData,
  dayContext,
  eveningCopy,
  middayCopy,
  morningCopy,
  weightCopy,
  withWeightLine,
} from './copy.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

type Slot = 'morning' | 'midday' | 'evening'
type Kind = Slot | 'weight'

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

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Antrenman serisi: sabah özetine eklenir.
 *
 * Sabah seçildi: "serini bozma" ancak gün önündeyken harekete geçirebilir,
 * akşam söylendiğinde yapılacak bir şey kalmıyor. Sorgu yalnızca tarih
 * sütununu okuyor ve bir yılla sınırlı.
 */
async function loadStreak(uid: string, date: string): Promise<StreakSummary | null> {
  // ASLA fırlatmaz. Seri cümlesi süs; sabah özetinin kendisi değil. Buradan
  // çıkan bir istisna o kullanıcının sabah özetini düşürürdü.
  try {
    const { data, error } = await supabase
      .from('workouts')
      .select('date')
      .eq('user_id', uid)
      .eq('status', 'completed')
      .gte('date', shiftDate(date, -365))

    if (error || !data || data.length === 0) return null
    return computeStreak((data as Array<{ date: string }>).map((r) => r.date), date)
  } catch (err) {
    console.error(`streak hesaplanamadi (${uid}):`, err instanceof Error ? err.message : err)
    return null
  }
}

async function activeTarget(uid: string): Promise<{ calories: number | null; protein_g: number | null } | null> {
  const { data } = await supabase
    .from('nutrition_targets')
    .select('calories, protein_g')
    .eq('user_id', uid)
    .eq('is_active', true)
    .maybeSingle()
  return data as { calories: number | null; protein_g: number | null } | null
}

async function dayMeals(uid: string, date: string): Promise<Array<{ total_calories: number | null; total_protein: number | null }>> {
  const { data } = await supabase
    .from('meals')
    .select('total_calories, total_protein')
    .eq('user_id', uid)
    .eq('date', date)
  return (data ?? []) as Array<{ total_calories: number | null; total_protein: number | null }>
}

async function buildMorning(uid: string, date: string, time: string, ctx: DayContext): Promise<Copy> {
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

  const blockCount = count ?? 0
  const first = next?.[0]

  // Takvim boşsa "planla" demek yerine listedeki en değerli işi hatırlat.
  let topTask: string | null = null
  if (blockCount === 0) {
    const { data: tasks } = await supabase
      .from('tasks')
      .select('title')
      .eq('user_id', uid)
      .not('status', 'in', '(done,deferred,blocked)')
      .or(`scheduled_date.is.null,scheduled_date.lte.${date}`)
      .order('priority_score', { ascending: false })
      .limit(1)
    topTask = (tasks?.[0]?.title as string | undefined) ?? null
  }

  return morningCopy(
    {
      blockCount,
      firstBlock: first ? { label: first.label as string, start: (first.start_time as string).slice(0, 5) } : null,
      topTask,
      // Seri cümlesi gövdenin sonuna ekleniyor, ayrı bir bildirim olarak değil:
      // sabah üst üste iki push atmak bildirimlerin tamamının kapatılmasına yol açıyor.
      streak: await loadStreak(uid, date),
    },
    ctx,
  )
}

async function buildMidday(uid: string, date: string, time: string, ctx: DayContext): Promise<Copy> {
  const { count: remaining } = await supabase
    .from('time_blocks')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', uid)
    .eq('date', date)
    .gte('start_time', time)

  const meals = await dayMeals(uid, date)
  const kcal = meals.reduce((s, m) => s + (m.total_calories ?? 0), 0)
  const target = meals.length > 0 ? await activeTarget(uid) : null

  return middayCopy(
    { remainingBlocks: remaining ?? 0, mealCount: meals.length, kcal, targetKcal: target?.calories ?? null },
    ctx,
  )
}

async function buildEvening(uid: string, date: string, ctx: DayContext): Promise<Copy | null> {
  const meals = await dayMeals(uid, date)
  // Hiç öğün yoksa akşam özeti göndermenin anlamı yok
  if (meals.length === 0) return null

  const [target, tomorrow] = await Promise.all([
    activeTarget(uid),
    supabase
      .from('time_blocks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', uid)
      .eq('date', shiftDate(date, 1)),
  ])

  return eveningCopy(
    {
      mealCount: meals.length,
      kcal: meals.reduce((s, m) => s + (m.total_calories ?? 0), 0),
      protein: meals.reduce((s, m) => s + (m.total_protein ?? 0), 0),
      targetKcal: target?.calories ?? null,
      targetProtein: target?.protein_g ?? null,
      tomorrowBlocks: tomorrow.count ?? 0,
    },
    ctx,
  )
}

/**
 * Tartı hatırlatmasının verisi; bugün zaten tartı varsa null (gönderilmez).
 * Health senkronundan gelen tartı da sayılır: kaynak fark etmez.
 */
async function loadWeight(uid: string, date: string): Promise<WeightData | null> {
  const { data, error } = await supabase
    .from('weight_logs')
    .select('date, weight_kg')
    .eq('user_id', uid)
    .lte('date', date)
    .order('date', { ascending: false })
    .limit(60)

  if (error) throw error
  const rows = (data ?? []) as Array<{ date: string; weight_kg: number | string }>
  if (rows[0]?.date === date) return null

  const last = rows[0]
  let streakDays = 0
  let expected = shiftDate(date, -1)
  for (const row of rows) {
    if (row.date !== expected) break
    streakDays++
    expected = shiftDate(expected, -1)
  }

  return {
    lastKg: last ? Number(last.weight_kg) : null,
    daysSinceLast: last
      ? Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${last.date}T00:00:00Z`)) / 86_400_000)
      : null,
    streakDays,
  }
}

/**
 * Idempotans kilidi: aynı kullanıcı + tür + yerel gün için tek gönderim.
 * Cron aynı saat içinde iki kez tetiklenirse (yeniden deneme, elle test,
 * ikinci bir zamanlayıcı) insert primary key'e çarpar ve bildirim
 * tekrarlanmaz. Push'tan hemen önce yazılır ki yarış durumunda da tutsun.
 */
async function acquireLock(uid: string, kind: Kind, date: string): Promise<boolean> {
  const { error } = await supabase
    .from('notification_log')
    .insert({ user_id: uid, kind: `daily_digest_${kind}`, local_date: date })
  if (!error) return true
  // 23505 = unique_violation → bu tür bugün zaten gönderilmiş
  if (error.code !== '23505') console.error(`notification_log insert failed for ${uid}/${kind}:`, error.message)
  return false
}

Deno.serve(async () => {
  const { data: prefs, error } = await supabase
    .from('notification_preferences')
    .select(
      'user_id, timezone, digest_hour, digest_enabled, midday_hour, midday_enabled, evening_hour, evening_enabled, weight_hour, weight_enabled',
    )

  if (error) {
    return new Response(`DB error: ${error.message}`, { status: 500 })
  }

  const pushMessages: PushMessage[] = []
  const bySlot: Record<Kind, number> = { morning: 0, midday: 0, evening: 0, weight: 0 }
  // Kilit push'tan önce yazılıyor; gönderim tutmazsa geri alınabilmesi için
  // kimin hangi türleri kilitlediği ve hangi token'lara yazıldığı saklanır.
  // Bir kullanıcı koşu başına tek bildirim alır, uid anahtar olarak yeterli.
  const locked = new Map<string, { kinds: Kind[]; date: string; tokens: string[] }>()

  for (const pref of prefs ?? []) {
    const tz = (pref.timezone as string) ?? 'Europe/Istanbul'
    const { hour, date, time } = localNow(tz)

    // Bu saatte hangi slot düşüyor? (aynı saate iki slot ayarlanmışsa ilki kazanır)
    let slot: Slot | null = null
    if (pref.digest_enabled && hour === pref.digest_hour) slot = 'morning'
    else if (pref.midday_enabled && hour === pref.midday_hour) slot = 'midday'
    else if (pref.evening_enabled && hour === pref.evening_hour) slot = 'evening'
    const weightDue = pref.weight_enabled === true && hour === pref.weight_hour
    if (!slot && !weightDue) continue

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
    const ctx = dayContext(uid, date)

    // Tek kullanıcının içeriği hazırlanamazsa yalnızca o içerik atlanır.
    // Korumasız hâlde bir kişide çıkan istisna döngüyü kırıyor ve o saatte
    // kimse bildirim alamıyordu; üstelik cron 500 görüp sessizce geçiyordu.
    let content: Copy | null = null
    if (slot) {
      try {
        content = slot === 'morning'
          ? await buildMorning(uid, date, time, ctx)
          : slot === 'midday'
          ? await buildMidday(uid, date, time, ctx)
          : await buildEvening(uid, date, ctx)
      } catch (err) {
        console.error(`digest icerigi hazirlanamadi (${uid}/${slot}):`, err instanceof Error ? err.message : err)
      }
    }

    let weight: WeightData | null = null
    if (weightDue) {
      try {
        weight = await loadWeight(uid, date)
      } catch (err) {
        console.error(`tarti verisi okunamadi (${uid}):`, err instanceof Error ? err.message : err)
      }
    }

    // Gönderilecek bir şey yoksa kilidi de yazma: akşam özeti öğün girilmemişse
    // null döner, tartı bugün girildiyse null döner; ikisi de bugün hâlâ
    // gönderilebilir sayılmalı.
    const mainLocked = slot !== null && content !== null && (await acquireLock(uid, slot, date))
    const weightLocked = weight !== null && (await acquireLock(uid, 'weight', date))

    let message: Copy
    let type: string
    if (mainLocked && slot && content) {
      // Aynı saatte iki push yerine tek push: tartı satırı özetin sonuna eklenir.
      message = weightLocked && weight ? withWeightLine(content, weight, ctx) : content
      type = `daily_digest_${slot}`
    } else if (weightLocked && weight) {
      message = weightCopy(weight, ctx)
      type = 'daily_digest_weight'
    } else {
      continue
    }

    for (const token of uniqueTokens) {
      pushMessages.push({
        to: token,
        title: message.title,
        body: message.body,
        data: { type },
        sound: 'default',
      })
    }

    const kinds: Kind[] = []
    if (mainLocked && slot) kinds.push(slot)
    if (weightLocked) kinds.push('weight')
    locked.set(uid, { kinds, date, tokens: uniqueTokens })
    for (const kind of kinds) bySlot[kind]++
  }

  const { sent, dropped, failed } = await sendExpoPush(
    pushMessages,
    supabase as unknown as PushSupabase,
  )

  // Teslim edilemeyen digest'in kilidi kalırsa o tür bugün bir daha denenmez ve
  // bildirim büsbütün kaybolur. Bütün token'ları başarısız olan kullanıcının
  // kilitleri geri alınır; saat başı koşan cron aynı saat içinde tekrar dener.
  // Silme kullanıcı bazında yapılır: `in()` yalnızca o kullanıcının türlerini
  // kapsar, başka kullanıcıların aynı gün/tür satırlarına dokunmaz.
  const failedTokens = new Set(failed)
  for (const [uid, entry] of locked) {
    if (entry.tokens.length === 0) continue
    if (!entry.tokens.every((token) => failedTokens.has(token))) continue

    for (const kind of entry.kinds) bySlot[kind]--
    const { error: rollbackError } = await supabase
      .from('notification_log')
      .delete()
      .eq('user_id', uid)
      .in('kind', entry.kinds.map((kind) => `daily_digest_${kind}`))
      .eq('local_date', entry.date)
    if (rollbackError) console.error(`Kilit geri alinamadi (${uid}):`, rollbackError.message)
  }

  // notification_log artık blok hatırlatmalarının da kilidi: günde kullanıcı
  // başına birkaç satır yazılıyor. Saat başı çalışan tek yer burası olduğu için
  // budama da burada. Hata sonucu etkilemez, bildirim gitti bile.
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
