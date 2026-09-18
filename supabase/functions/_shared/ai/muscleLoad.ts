// ============================================================
// Antrenman koçu için son 7 günün kas yükü
// ============================================================
//
// Tamamlanan her set ana kasa PRIMARY, her yardımcı kasa SECONDARY "etkili set"
// ekler. Kilogram değil set sayılır: haftalık hacim önerileri (kas başına 10-20
// set gibi) set üzerinden konuşulur ve vücut ağırlığı hareketleri de adil sayılır.
// Yardımcı kas verisi 048 migration'ında. Edge function'lar @lifeos/shared'i içe
// aktaramadığı için hesap burada, bağımsız ve yan etkisiz.

export const PRIMARY = 1
export const SECONDARY = 0.4

/** Son 48 saatte en az bu kadar etkili set alan kas "yoğun çalışılmış" sayılır. */
export const RECENT_HEAVY_SETS = 6
/** En yüklü kasın bu oranının altında kalan kas ihmal edilmiş sayılır. */
export const NEGLECT_RATIO = 0.25

/**
 * Yük hesabına girmeyen kategoriler. "Hamstring Germe" ana kası Arka Bacak;
 * sayılsaydı her gün esneyen kullanıcının arka bacağı hem ihmal edilmemiş hem de
 * "yoğun çalışılmış" görünür, koç o kası programdan çıkarırdı.
 */
const NON_TRAINING_CATEGORIES = new Set(['flexibility', 'mobility'])

/** Satırda gösterilmeyen gruplar (name_en): vücut bölgesi değil, aktivite türü. */
const HIDDEN_GROUPS = new Set(['Full Body', 'Flexibility', 'Swimming'])

export interface LoadSet {
  /** Antrenmanın kullanıcı yerelindeki tarihi, YYYY-MM-DD. */
  date: string
  completed: boolean
  category: string | null
  muscle_group_id: number | null
  secondary_muscle_group_ids: number[]
}

export interface MuscleGroupRef {
  id: number
  name: string
  name_en: string
}

export interface MuscleLoadSummary {
  /** Penceredeki tamamlanmış set sayısı (kategori fark etmeksizin). */
  completedSets: number
  /** Yükü olan kaslar, büyükten küçüğe, bir ondalığa yuvarlanmış. */
  loads: { name: string; sets: number }[]
  neglected: string[]
  recentHeavy: string[]
}

/** Kas grubu id'si -> etkili set. */
export function computeMuscleLoad(sets: LoadSet[]): Map<number, number> {
  const load = new Map<number, number>()
  const add = (id: number, amount: number) => load.set(id, (load.get(id) ?? 0) + amount)
  for (const set of sets) {
    if (!set.completed) continue
    if (set.category !== null && NON_TRAINING_CATEGORIES.has(set.category)) continue
    const primary = set.muscle_group_id
    if (primary !== null) add(primary, PRIMARY)
    // Veri tekrar ya da ana kası içerse bile kas başına bir kez, ana kas hariç.
    for (const id of new Set(set.secondary_muscle_group_ids)) {
      if (id !== primary) add(id, SECONDARY)
    }
  }
  return load
}

export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/** Verilen saat diliminde bugünün tarihi. Dilim yoksa ya da geçersizse UTC. */
export function localDate(timeZone: string | null, now: Date = new Date()): string {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(now)
      const part = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
      const date = `${part('year')}-${part('month')}-${part('day')}`
      if (isIsoDate(date)) return date
    } catch { /* geçersiz dilim: UTC'ye düş */ }
  }
  return now.toISOString().slice(0, 10)
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

/**
 * `workouts.select('date, workout_sets(completed, exercise:exercises(category,
 * muscle_group_id, secondary_muscle_group_ids))')` sonucunu düz set listesine
 * çevirir. İstemci tipsiz döndüğü için her alan burada daraltılır.
 */
export function flattenWorkoutRows(rows: unknown): LoadSet[] {
  if (!Array.isArray(rows)) return []
  return rows.flatMap((row): LoadSet[] => {
    if (!row || typeof row !== 'object') return []
    const workout = row as Record<string, unknown>
    const date = workout['date']
    const sets = workout['workout_sets']
    if (!isIsoDate(date) || !Array.isArray(sets)) return []
    return sets.flatMap((rawSet): LoadSet[] => {
      if (!rawSet || typeof rawSet !== 'object') return []
      const set = rawSet as Record<string, unknown>
      const exercise = set['exercise']
      if (!exercise || typeof exercise !== 'object') return []
      const ex = exercise as Record<string, unknown>
      const secondary = Array.isArray(ex['secondary_muscle_group_ids']) ? ex['secondary_muscle_group_ids'] : []
      return [{
        date,
        completed: set['completed'] === true,
        category: typeof ex['category'] === 'string' ? ex['category'] : null,
        muscle_group_id: numberOrNull(ex['muscle_group_id']),
        secondary_muscle_group_ids: secondary.flatMap((id) => {
          const n = numberOrNull(id)
          return n === null ? [] : [n]
        }),
      }]
    })
  })
}

/**
 * Son 7 gün (bugün dahil) ve son 48 saat özeti. Tarih yerel gün olarak
 * geldiği için 48 saat "bugün + dün" diye yaklaşıklanır.
 */
export function summarizeMuscleLoad(groups: MuscleGroupRef[], sets: LoadSet[], today: string): MuscleLoadSummary {
  const weekStart = shiftDate(today, -6)
  const recentStart = shiftDate(today, -1)
  const week = sets.filter((s) => s.date >= weekStart && s.date <= today)
  const weekLoad = computeMuscleLoad(week)
  const recentLoad = computeMuscleLoad(week.filter((s) => s.date >= recentStart))

  const visible = groups
    .filter((g) => !HIDDEN_GROUPS.has(g.name_en))
    .sort((a, b) => a.id - b.id)
  const loadOf = (g: MuscleGroupRef) => weekLoad.get(g.id) ?? 0
  const max = Math.max(0, ...visible.map(loadOf))

  return {
    completedSets: week.filter((s) => s.completed).length,
    loads: visible
      .filter((g) => loadOf(g) > 0)
      .map((g) => ({ name: g.name, sets: Math.round(loadOf(g) * 10) / 10 }))
      .sort((a, b) => b.sets - a.sets),
    neglected: max > 0 ? visible.filter((g) => loadOf(g) < max * NEGLECT_RATIO).map((g) => g.name) : [],
    recentHeavy: visible
      .filter((g) => (recentLoad.get(g.id) ?? 0) >= RECENT_HEAVY_SETS)
      .map((g) => g.name),
  }
}

/** Koçun DEĞİŞKEN bloğundaki tek satır. */
export function muscleLoadLine(summary: MuscleLoadSummary): string {
  if (summary.completedSets === 0) return 'Son 7 günde kayıtlı antrenman yok.'
  if (summary.loads.length === 0) {
    return 'Son 7 gün kas yükü (etkili set): kuvvet seti yok, yalnızca kardiyo ya da esneme kaydı var.'
  }
  const parts = [
    `Son 7 gün kas yükü (etkili set): ${summary.loads.map((l) => `${l.name} ${l.sets}`).join(', ')}.`,
    summary.neglected.length > 0 ? `İhmal edilen: ${summary.neglected.join(', ')}.` : 'İhmal edilen kas yok.',
  ]
  if (summary.recentHeavy.length > 0) {
    parts.push(`Son 48 saatte yoğun çalışılan: ${summary.recentHeavy.join(', ')}.`)
  }
  return parts.join(' ')
}
