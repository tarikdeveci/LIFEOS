// daily_reports satırının yaşam döngüsü: hesapla, birleştir, yaz. daily-report fonksiyonu
// (kullanıcı JWT) ve daily-digest akşam slotu (service role) aynı yolu kullanır.
//
// Bugün: olgular yeniden hesaplanır. Geçmiş gün ve satır varsa: öğe listesi DONDURULUR
// (gece devri planı değiştirdi), yalnızca mevcut öğelerin sonucu tazelenir. Tazeleme
// tarihe değil kimliğe bakar: açık kalan görev gece devriyle başka güne taşınmıştır,
// ertesi gün "yaptım" denince o güne bağlı sorguda bulunamazdı.

import { pruneCheckin } from './checkin.ts'
import { type Db, loadDayFacts, rowsOf } from './facts.ts'
import { buildTemplateNarrative } from './narrative.ts'
import type { ReportLanguage } from './text.ts'
import type { DailyReport, DayCheckin, DayItem } from './types.ts'

export interface RefreshInput {
  userId: string
  date: string
  /** Kullanıcının saat diliminde bugün. */
  today: string
  timezone: string
  language: ReportLanguage
  progress: Readonly<Record<string, number>>
  /** Geldiyse saklanan kapanışın yerine yazılır (tam gövde: geri alma da buradan geçer). */
  checkin?: DayCheckin
  /** Rapor açıldı: opened_at boşsa doldurulur. */
  opened?: boolean
  now?: Date
}

/** Öğe anahtarı → şu an tamamlanmış mı. Bulunamayan (silinmiş) öğe haritada yoktur. */
export type ItemStates = ReadonlyMap<string, boolean>

/** Donmuş öğelerin sonucunu güncel duruma çeker; listeyi, başlığı, programı değiştirmez. */
export function refreshFrozenItems(frozen: readonly DayItem[], states: ItemStates): DayItem[] {
  return frozen.map((item) => {
    const done = states.get(item.key)
    if (done === undefined) return item
    const outcome = done ? 'done' : 'open'
    return outcome === item.outcome ? item : { ...item, outcome }
  })
}

function idsOf(items: readonly DayItem[], prefix: string): string[] {
  return items.filter((i) => i.key.startsWith(prefix)).map((i) => i.key.slice(prefix.length))
}

async function loadItemStates(db: Db, userId: string, date: string, items: readonly DayItem[]): Promise<ItemStates> {
  const taskIds = idsOf(items, 'task:')
  const blockIds = idsOf(items, 'block:')
  const habitIds = idsOf(items, 'habit:')
  const none = Promise.resolve({ data: [], error: null })

  const [tasks, blocks, routines, completions] = await Promise.all([
    taskIds.length > 0 ? db.from('tasks').select('id, status').eq('user_id', userId).in('id', taskIds) : none,
    blockIds.length > 0 ? db.from('time_blocks').select('id, completed_at').eq('user_id', userId).in('id', blockIds) : none,
    habitIds.length > 0 ? db.from('routines').select('id, times_per_day').eq('user_id', userId).in('id', habitIds) : none,
    habitIds.length > 0
      ? db.from('routine_completions').select('routine_id, count').eq('user_id', userId).eq('completed_on', date).in('routine_id', habitIds)
      : none,
  ])

  const states = new Map<string, boolean>()
  for (const t of rowsOf<{ id: string; status: string }>(tasks, 'tasks')) states.set(`task:${t.id}`, t.status === 'done')
  for (const b of rowsOf<{ id: string; completed_at: string | null }>(blocks, 'time_blocks')) {
    states.set(`block:${b.id}`, b.completed_at !== null)
  }
  const marks = new Map(rowsOf<{ routine_id: string; count: number }>(completions, 'routine_completions').map((c) => [c.routine_id, c.count]))
  for (const r of rowsOf<{ id: string; times_per_day: number | null }>(routines, 'routines')) {
    states.set(`habit:${r.id}`, (marks.get(r.id) ?? 0) >= (r.times_per_day ?? 1))
  }
  return states
}

async function findReport(db: Db, userId: string, date: string): Promise<DailyReport | null> {
  const { data, error } = await db.from('daily_reports').select('*').eq('user_id', userId).eq('date', date).maybeSingle()
  if (error) throw new Error(`daily_reports: ${error.message}`)
  return (data as DailyReport | null) ?? null
}

/** Raporu hesaplar ve daily_reports'a yazar, satırı döner. Hata fırlatır. */
export async function refreshReport(db: Db, input: RefreshInput): Promise<DailyReport> {
  const { userId, date } = input
  const now = input.now ?? new Date()
  const existing = await findReport(db, userId, date)

  let facts = await loadDayFacts(db, { userId, date, timezone: input.timezone, progress: input.progress, now })
  const frozen = existing?.facts?.items
  if (date < input.today && Array.isArray(frozen)) {
    // Geçmiş gün: liste donuk, sonuçlar tazelenir. Hareket, odak, beslenme ve enerji gün
    // sonrası değişmediği için (geç gelen sağlık verisi dahil) olduğu gibi yeniden hesaplanır.
    facts = { ...facts, items: refreshFrozenItems(frozen, await loadItemStates(db, userId, date, frozen)) }
  }

  const checkin = pruneCheckin(input.checkin ?? existing?.checkin ?? {}, facts.items)
  // AI anlatısına dokunulmaz: yeniden üretmek bir AI çağrısı ve hak harcar.
  const narrative = existing?.narrative?.source === 'ai'
    ? existing.narrative
    : buildTemplateNarrative(facts, checkin, input.language)

  const { data, error } = await db
    .from('daily_reports')
    .upsert(
      {
        user_id: userId,
        date,
        facts,
        checkin,
        narrative,
        opened_at: existing?.opened_at ?? (input.opened ? now.toISOString() : null),
      },
      { onConflict: 'user_id,date' },
    )
    .select()
    .single()
  if (error) throw new Error(`daily_reports yazilamadi: ${error.message}`)
  return data as DailyReport
}
