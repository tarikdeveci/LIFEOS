// İkinci gün sabahı: hesabın açıldığı günün ertesi sabahı giden kişisel bildirim.
//
// NEDEN: canlı veride (2026-11-26) yeni kullanıcıların çoğu ilk günden sonra geri
// gelmiyor. Ertesi sabahki sıradan "takvim boş" metni yeni birine bir şey söylemiyor;
// bu metin dün ne yaptığını hatırlatır ve bugün tek bir sonraki adımı gösterir.
// Sabah slotunun yerine geçer, ayrı bir bildirim değildir (günde tek sabah bildirimi).

import type { Db } from '../_shared/report/facts.ts'
import { type Copy, type DayContext } from './copy.ts'

export interface FirstDayFacts {
  tasks: number
  meals: number
  workouts: number
  /** En yüksek öncelikli açık görev. */
  openTask: string | null
  /** Bugüne planlanmış blok: varsa normal sabah metni ilk bloğu zaten söyler. */
  blocksToday: number
}

/** Bir anın kullanıcının saat dilimindeki takvim günü (YYYY-AA-GG); okunamazsa null. */
function localDateOf(iso: string, timezone: string): string | null {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
  } catch {
    return at.toISOString().slice(0, 10)
  }
}

/**
 * Bugün, hesabın açıldığı yerel günün ertesi günü mü. Hesap tarihi olarak
 * notification_preferences.created_at kullanılır: kayıt tetikleyicisi satırı
 * hesapla aynı anda yazar (027).
 */
export function isSecondDay(createdAt: string | null | undefined, timezone: string, today: string): boolean {
  if (!createdAt) return false
  const day0 = localDateOf(createdAt, timezone)
  if (!day0) return false
  const next = new Date(`${day0}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString().slice(0, 10) === today
}

/** Kullanıcının bugünkü yerel gece yarısı, UTC an olarak. `time` yerel 'HH:MM'. */
export function localDayStartIso(time: string, now: Date): string {
  const [h, m] = time.split(':').map((v) => parseInt(v, 10))
  const minutes = (h ?? 0) * 60 + (m ?? 0)
  return new Date(now.getTime() - minutes * 60_000 - now.getUTCSeconds() * 1000 - now.getUTCMilliseconds()).toISOString()
}

/**
 * Hesap dün açıldığı için "dün" = hesabın ilk günü. Bu sabah bildirimden önce girilen kayıt
 * dünün sayımına girmez: görev bugünün yerel gece yarısından önce yazılmış olmalı, öğün ve
 * antrenman kendi tarih kolonlarıyla dünün günü olmalı.
 * ASLA fırlatmaz; okunamazsa null döner ve normal sabah metnine düşülür.
 */
export async function loadFirstDayFacts(db: Db, uid: string, today: string, time: string): Promise<FirstDayFacts | null> {
  try {
    const dayStart = localDayStartIso(time, new Date())
    const yesterday = new Date(`${today}T00:00:00Z`)
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    const day0 = yesterday.toISOString().slice(0, 10)
    const [tasks, meals, workouts, open, blocks] = await Promise.all([
      db.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', uid).lt('created_at', dayStart),
      db.from('meals').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('date', day0),
      db.from('workouts').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('date', day0).eq('status', 'completed'),
      db.from('tasks').select('title').eq('user_id', uid)
        .not('status', 'in', '(done,deferred,blocked)')
        .order('priority_score', { ascending: false }).limit(1),
      db.from('time_blocks').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('date', today),
    ])
    const failed = [tasks, meals, workouts, open, blocks].find((r) => r.error)
    if (failed?.error) throw failed.error
    const title = (open.data?.[0] as { title?: string } | undefined)?.title
    return {
      tasks: tasks.count ?? 0,
      meals: meals.count ?? 0,
      workouts: workouts.count ?? 0,
      openTask: typeof title === 'string' && title.trim() ? title : null,
      blocksToday: blocks.count ?? 0,
    }
  } catch (err) {
    console.error(`ilk gun verisi okunamadi (${uid}):`, err instanceof Error ? err.message : err)
    return null
  }
}

function pick(list: readonly string[], seed: number): string {
  return list[((seed % list.length) + list.length) % list.length] ?? list[0] ?? ''
}

function clip(text: string, max: number): string {
  const clean = text.trim().replace(/\s+/g, ' ')
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

/** "3 görev, 2 öğün ve 1 antrenman"; boş kalemler yazılmaz. */
function yesterdayList(f: FirstDayFacts): string | null {
  const parts = [
    f.tasks > 0 ? `${f.tasks} görev` : null,
    f.meals > 0 ? `${f.meals} öğün` : null,
    f.workouts > 0 ? `${f.workouts} antrenman` : null,
  ].filter((p): p is string => p !== null)
  if (parts.length === 0) return null
  if (parts.length === 1) return parts[0] ?? null
  return `${parts.slice(0, -1).join(', ')} ve ${parts[parts.length - 1]}`
}

export function secondDayCopy(f: FirstDayFacts, ctx: DayContext): Copy {
  const list = yesterdayList(f)
  const next = f.openTask
    ? pick([
        `Bugün sırada “${clip(f.openTask, 60)}” var.`,
        `Bugünün ilk işi: “${clip(f.openTask, 60)}”.`,
      ], ctx.seed)
    : f.meals > 0
      ? 'Bugünün ilk öğününü eklemek bir dakika sürer.'
      : 'Bugün için tek bir iş yaz, sırasını LifeOS kursun.'

  if (!list) {
    return {
      title: pick(['Günaydın, bugün iyi bir başlangıç günü', 'Küçük bir adım yeter'], ctx.seed),
      body: pick([
        'Aklındaki tek işi yaz, LifeOS önceliğe göre sıralasın.',
        'Bugünün ilk öğününü ya da ilk işini ekle, gerisi kendiliğinden toplanır.',
      ], ctx.seed),
    }
  }
  return {
    title: pick(['Dün iyi bir başlangıç yaptın', 'İkinci gün, aynı tempo', 'Dünkü başlangıcın üstüne'], ctx.seed),
    body: `Dün ${list} kaydettin. ${next}`,
  }
}
