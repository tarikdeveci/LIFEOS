/**
 * Strong / Hevy / FitNotes antrenman geçmişi CSV içe aktarma.
 *
 * Saf ayrıştırma burada. DB yazımı supabase/workouts.ts:importCsvWorkouts,
 * egzersiz adı eşleştirme utils/exerciseMatch.ts içinde.
 *
 * Ayrıştırıcı RFC 4180'i izler: tırnaklı alan ayraç, satır sonu ve "" kaçışı
 * içerebilir. Ayraç (virgül, noktalı virgül, sekme) başlık satırından bulunur.
 * Format, "gerekli sütunların hepsi var mı" diye başlıktan tespit edilir.
 * Uygulama günde tek antrenman tutar (workouts_user_date_unique_idx), bu yüzden
 * aynı güne düşen seanslar burada tek antrenmanda birleştirilir.
 */

export type CsvImportSource = 'strong' | 'hevy' | 'fitnotes'
export type WeightUnit = 'kg' | 'lb'

const LB_TO_KG = 0.45359237
const DEFAULT_WORKOUT_NAME = 'İçe Aktarılan Antrenman'

export interface ParsedImportSet {
  exerciseName: string
  setNumber: number
  weightKg: number | null
  reps: number | null
  durationSeconds: number | null
  distanceM: number | null
}

export interface ParsedImportWorkout {
  /** 'YYYY-MM-DD' */
  date: string
  name: string
  durationMinutes: number | null
  sets: ParsedImportSet[]
}

export interface CsvParseResult {
  source: CsvImportSource
  /** Gün başına tek antrenman, tarihe göre artan. */
  workouts: ParsedImportWorkout[]
  /** Ayrıştırılamadığı için atlanan satır sayısı (bozuk tarih, boş egzersiz adı vb.) */
  skippedRows: number
  /** Isınma seti olarak işaretlendiği için alınmayan set sayısı. */
  warmupSets: number
}

// ============================
// CSV ayrıştırma
// ============================

const DELIMITERS = [',', ';', '\t'] as const

/** Başlık satırında (tırnak dışında) en sık geçen ayraç; hiçbiri yoksa virgül. */
function detectDelimiter(text: string): string {
  const counts = new Map<string, number>(DELIMITERS.map((d) => [d, 0]))
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i)
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes && (ch === '\n' || ch === '\r')) break
    else if (!inQuotes && counts.has(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  }
  let best: string = ','
  for (const [d, n] of counts) if (n > (counts.get(best) ?? 0)) best = d
  return best
}

/** Metni satır ve hücrelere böler; tırnak içindeki ayraç ve satır sonları hücrede kalır. */
function tokenizeCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  const endRow = () => {
    row.push(cell.trim())
    cell = ''
    if (row.some((c) => c.length > 0)) rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i)
    if (inQuotes) {
      if (ch !== '"') cell += ch
      else if (text.charAt(i + 1) === '"') {
        cell += '"'
        i += 1
      } else inQuotes = false
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      row.push(cell.trim())
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text.charAt(i + 1) === '\n') i += 1
      endRow()
    } else {
      cell += ch
    }
  }
  endRow()
  return rows
}

function parseRows(text: string): { header: string[]; rows: string[][] } {
  const clean = text.replace(/^﻿/, '')
  const all = tokenizeCsv(clean, detectDelimiter(clean))
  const [header, ...rows] = all
  return { header: header ?? [], rows }
}

function rowToRecord(header: string[], row: string[]): Record<string, string> {
  const record: Record<string, string> = {}
  header.forEach((key, i) => {
    record[key] = row[i] ?? ''
  })
  return record
}

// ============================
// Sayı / birim yardımcıları
// ============================

function parseNumber(value: string | undefined): number | null {
  if (!value) return null
  const cleaned = value.replace(',', '.').trim()
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

function toKg(value: number | null, unit: WeightUnit): number | null {
  if (value === null) return null
  return unit === 'lb' ? Math.round(value * LB_TO_KG * 100) / 100 : value
}

/** "kg", "kgs", "lbs" gibi etiketlerden birim; tanınmazsa fallback. */
function weightUnitOf(label: string | undefined, fallback: WeightUnit): WeightUnit {
  const v = (label ?? '').trim().toLowerCase()
  if (v.startsWith('lb')) return 'lb'
  if (v.startsWith('kg')) return 'kg'
  return fallback
}

const METERS_PER_UNIT: Readonly<Record<string, number>> = {
  m: 1, meter: 1, meters: 1, metre: 1, metres: 1,
  km: 1000, kms: 1000, kilometer: 1000, kilometers: 1000, kilometre: 1000, kilometres: 1000,
  mi: 1609.344, mile: 1609.344, miles: 1609.344,
  ft: 0.3048, foot: 0.3048, feet: 0.3048,
  yd: 0.9144, yard: 0.9144, yards: 0.9144,
}

/** Mesafeyi metreye çevirir. Birim etiketi yoksa ya da tanınmazsa fallback birimi kullanılır. */
function toMeters(value: number | null, unitLabel: string | undefined, fallback: 'km' | 'mi'): number | null {
  if (value === null) return null
  const factor = METERS_PER_UNIT[(unitLabel ?? '').trim().toLowerCase()] ?? METERS_PER_UNIT[fallback] ?? 1000
  return Math.round(value * factor)
}

/** Birim sütunu olmayan dışa aktarımlarda: libre kullanan mil, kilo kullanan km kullanıyordur. */
function distanceFallback(unit: WeightUnit): 'km' | 'mi' {
  return unit === 'lb' ? 'mi' : 'km'
}

/**
 * "45min", "1h 5m", "45" gibi biçimleri dakikaya çevirir. Birimsiz sayı 600'ü
 * geçiyorsa saniye sayılır: 10 saatlik antrenman yok, saniye cinsinden süre var.
 */
function parseDurationMinutes(value: string | undefined): number | null {
  if (!value) return null
  const trimmed = value.trim()
  const plain = parseNumber(trimmed)
  if (plain !== null && !/[a-zA-Zğüşıöç]/.test(trimmed)) return Math.round(plain > 600 ? plain / 60 : plain)

  const hourMatch = /(\d+)\s*h/i.exec(trimmed)
  const minMatch = /(\d+)\s*m/i.exec(trimmed)
  const hours = hourMatch ? Number.parseInt(hourMatch[1] ?? '0', 10) : 0
  const mins = minMatch ? Number.parseInt(minMatch[1] ?? '0', 10) : 0
  return hours || mins ? hours * 60 + mins : null
}

/** FitNotes 'Time' sütunu "mm:ss" / "hh:mm:ss" ya da saniye olabilir. */
function parseTimeToSeconds(value: string | undefined): number | null {
  if (!value) return null
  if (value.includes(':')) {
    const parts = value.split(':').map((p) => Number.parseInt(p, 10))
    if (parts.some((p) => !Number.isFinite(p))) return null
    return parts.reduce((total, p) => total * 60 + p, 0)
  }
  return parseNumber(value)
}

// ============================
// Tarih
// ============================

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

const MONTHS: Readonly<Record<string, number>> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  oca: 0, şub: 1, nis: 3, haz: 5, tem: 6, ağu: 7, eyl: 8, eki: 9, kas: 10, ara: 11,
}

const TIME_PART = String.raw`(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?`
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/
const HAS_ZONE = /T?\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:Z|[+-]\d{2}:?\d{2})$/
/** Hevy: "8 Jan 2024, 14:32" */
const DAY_MONTH_YEAR = new RegExp(String.raw`^(\d{1,2})\s+([^\s\d.,]+)\.?,?\s+(\d{4})` + TIME_PART)
/** "Jan 8, 2024, 2:32 PM" */
const MONTH_DAY_YEAR = new RegExp(String.raw`^([^\s\d.,]+)\.?\s+(\d{1,2}),?\s+(\d{4})` + TIME_PART)

/** Yerel saatle tarih kurar; 31 Şubat gibi taşan değerleri reddeder. */
function buildDate(y: number, month: number, d: number, h = 0, min = 0, s = 0): Date | null {
  const date = new Date(y, month, d, h, min, s)
  if (date.getFullYear() !== y || date.getMonth() !== month || date.getDate() !== d) return null
  return Number.isNaN(date.getTime()) ? null : date
}

function hour24(hour: string | undefined, meridiem: string | undefined): number {
  const h = Number(hour ?? 0)
  if (!meridiem) return h
  return (h % 12) + (meridiem.toLowerCase() === 'pm' ? 12 : 0)
}

function monthIndex(name: string | undefined): number | null {
  return MONTHS[(name ?? '').toLocaleLowerCase('tr-TR').slice(0, 3)] ?? null
}

/**
 * "2024-01-08 14:32:00", "2024-01-08", "8 Jan 2024, 14:32", "Jan 8, 2024" gibi
 * biçimleri saatiyle birlikte okur. Hermes'in Date ayrıştırıcısı yalnızca ISO'yu
 * güvenilir okuduğu için saat dilimsiz biçimler elle kurulur.
 */
export function parseFlexibleDate(value: string | undefined): Date | null {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return null

  const iso = ISO_DATE.exec(trimmed)
  if (iso) {
    if (HAS_ZONE.test(trimmed)) {
      const ms = Date.parse(trimmed.replace(' ', 'T'))
      return Number.isFinite(ms) ? new Date(ms) : null
    }
    return buildDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), Number(iso[4] ?? 0), Number(iso[5] ?? 0), Number(iso[6] ?? 0))
  }

  const dmy = DAY_MONTH_YEAR.exec(trimmed)
  const dmyMonth = dmy ? monthIndex(dmy[2]) : null
  if (dmy && dmyMonth !== null) {
    return buildDate(Number(dmy[3]), dmyMonth, Number(dmy[1]), hour24(dmy[4], dmy[7]), Number(dmy[5] ?? 0), Number(dmy[6] ?? 0))
  }

  const mdy = MONTH_DAY_YEAR.exec(trimmed)
  const mdyMonth = mdy ? monthIndex(mdy[1]) : null
  if (mdy && mdyMonth !== null) {
    return buildDate(Number(mdy[3]), mdyMonth, Number(mdy[2]), hour24(mdy[4], mdy[7]), Number(mdy[5] ?? 0), Number(mdy[6] ?? 0))
  }

  const ms = Date.parse(trimmed)
  return Number.isFinite(ms) ? new Date(ms) : null
}

// ============================
// Format tespiti
// ============================

/** FitNotes ağırlık sütunu: "Weight", "Weight (kgs)" ya da "Weight (lbs)". */
function fitNotesWeightColumn(header: string[]): string | null {
  return header.find((h) => /^weight(\s*\((kgs?|lbs?)\))?$/i.test(h)) ?? null
}

export function detectCsvSource(header: string[]): CsvImportSource | null {
  const has = (name: string) => header.includes(name)

  if (has('exercise_title') && has('set_index') && (has('weight_kg') || has('weight_lbs'))) {
    return 'hevy'
  }
  if (has('Workout Name') && has('Exercise Name') && has('Set Order')) {
    return 'strong'
  }
  // FitNotes'ta workout/set gruplama sütunu yok; Exercise + Category ikilisi ayırt edici.
  if (has('Exercise') && has('Category') && fitNotesWeightColumn(header) !== null && has('Reps')) {
    return 'fitnotes'
  }
  return null
}

// ============================
// Format bazlı ayrıştırma
// ============================

type SetKind = 'working' | 'warmup' | 'other'

/** Strong 'Set Order': sayı normal set, "W" ısınma, "D"/"F" drop/failure. "Rest Timer", "Note" gibi satırlar set değil. */
function strongSetKind(order: string | undefined): SetKind {
  const v = (order ?? '').trim()
  if (v === '' || /^\d+$/.test(v) || /^[df]\d*$/i.test(v)) return 'working'
  if (/^w\d*$/i.test(v)) return 'warmup'
  return 'other'
}

/** Hevy 'set_type': normal, warmup, dropset, failure. */
function hevySetKind(type: string | undefined): SetKind {
  return (type ?? '').trim().toLowerCase() === 'warmup' ? 'warmup' : 'working'
}

interface WorkoutAccumulator {
  date: string
  name: string
  durationMinutes: number | null
  sets: ParsedImportSet[]
}

type SetValues = Omit<ParsedImportSet, 'exerciseName' | 'setNumber'>

interface Parsed {
  workouts: WorkoutAccumulator[]
  skipped: number
  warmups: number
}

/** Satırları anahtara göre gruplayan ortak döngü; format farkı `read` içinde. */
function collect(
  rows: string[][],
  header: string[],
  read: (r: Record<string, string>) =>
    | { kind: 'skip' }
    | { kind: SetKind; key: string; date: Date; name: string; durationMinutes: number | null; exerciseName: string; values: SetValues },
): Parsed {
  const groups = new Map<string, WorkoutAccumulator>()
  let skipped = 0
  let warmups = 0

  for (const row of rows) {
    const item = read(rowToRecord(header, row))
    if (item.kind === 'skip') {
      skipped += 1
      continue
    }
    if (item.kind === 'warmup') {
      warmups += 1
      continue
    }
    if (item.kind === 'other') continue

    let acc = groups.get(item.key)
    if (!acc) {
      acc = { date: toIsoDate(item.date), name: item.name, durationMinutes: item.durationMinutes, sets: [] }
      groups.set(item.key, acc)
    }
    acc.sets.push({ exerciseName: item.exerciseName, setNumber: 0, ...item.values })
  }

  return { workouts: [...groups.values()], skipped, warmups }
}

function parseStrong(rows: string[][], header: string[], unit: WeightUnit): Parsed {
  return collect(rows, header, (r) => {
    const date = parseFlexibleDate(r['Date'])
    const exerciseName = r['Exercise Name']?.trim()
    if (!date || !exerciseName) return { kind: 'skip' }
    const name = r['Workout Name']?.trim() || DEFAULT_WORKOUT_NAME
    const rowUnit = weightUnitOf(r['Weight Unit'], unit)
    return {
      kind: strongSetKind(r['Set Order']),
      key: `${r['Date']}|${name}`,
      date,
      name,
      durationMinutes: parseDurationMinutes(r['Duration'] ?? r['Workout Duration']),
      exerciseName,
      values: {
        weightKg: toKg(parseNumber(r['Weight']), rowUnit),
        reps: parseNumber(r['Reps']),
        durationSeconds: parseNumber(r['Seconds']),
        distanceM: toMeters(parseNumber(r['Distance']), r['Distance Unit'], distanceFallback(unit)),
      },
    }
  })
}

function parseHevy(rows: string[][], header: string[]): Parsed {
  const hasKg = header.includes('weight_kg')
  const hasKm = header.includes('distance_km')
  return collect(rows, header, (r) => {
    const start = parseFlexibleDate(r['start_time'])
    const exerciseName = r['exercise_title']?.trim()
    if (!start || !exerciseName) return { kind: 'skip' }
    const end = parseFlexibleDate(r['end_time'])
    const name = r['title']?.trim() || DEFAULT_WORKOUT_NAME
    return {
      kind: hevySetKind(r['set_type']),
      key: `${r['start_time']}|${name}`,
      date: start,
      name,
      durationMinutes: end ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000)) : null,
      exerciseName,
      values: {
        weightKg: hasKg ? parseNumber(r['weight_kg']) : toKg(parseNumber(r['weight_lbs']), 'lb'),
        reps: parseNumber(r['reps']),
        durationSeconds: parseNumber(r['duration_seconds']),
        distanceM: hasKm
          ? toMeters(parseNumber(r['distance_km']), 'km', 'km')
          : toMeters(parseNumber(r['distance_miles']), 'mi', 'mi'),
      },
    }
  })
}

function parseFitNotes(rows: string[][], header: string[], unit: WeightUnit): Parsed {
  const weightColumn = fitNotesWeightColumn(header) ?? 'Weight'
  const columnUnit = weightUnitOf(/\((\w+)\)/.exec(weightColumn)?.[1], unit)
  // FitNotes bir antrenmanı ayrı satır grubu olarak işaretlemiyor; aynı takvim
  // gününün tüm satırları tek antrenman sayılır (uygulamanın kendi davranışı).
  return collect(rows, header, (r) => {
    const date = parseFlexibleDate(r['Date'])
    const exerciseName = r['Exercise']?.trim()
    if (!date || !exerciseName) return { kind: 'skip' }
    return {
      kind: 'working',
      key: toIsoDate(date),
      date,
      name: DEFAULT_WORKOUT_NAME,
      durationMinutes: null,
      exerciseName,
      values: {
        weightKg: toKg(parseNumber(r[weightColumn]), columnUnit),
        reps: parseNumber(r['Reps']),
        durationSeconds: parseTimeToSeconds(r['Time']),
        distanceM: toMeters(parseNumber(r['Distance']), r['Distance Unit'], distanceFallback(unit)),
      },
    }
  })
}

// ============================
// Aynı gün birleştirme
// ============================

/**
 * Aynı tarihe düşen seansları tek antrenmanda toplar: adlar " + " ile birleşir,
 * süreler toplanır, set numaraları hareket başına 1'den yeniden verilir.
 */
function mergeByDay(workouts: readonly WorkoutAccumulator[]): ParsedImportWorkout[] {
  const byDay = new Map<string, WorkoutAccumulator[]>()
  for (const w of workouts) {
    if (w.sets.length === 0) continue
    byDay.set(w.date, [...(byDay.get(w.date) ?? []), w])
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, sessions]) => {
      const names = [...new Set(sessions.map((s) => s.name))]
      const durations = sessions.map((s) => s.durationMinutes).filter((d): d is number => d !== null)
      const counters = new Map<string, number>()
      const sets = sessions.flatMap((s) => s.sets).map((set) => {
        const n = (counters.get(set.exerciseName) ?? 0) + 1
        counters.set(set.exerciseName, n)
        return { ...set, setNumber: n }
      })
      return {
        date,
        name: names.join(' + '),
        durationMinutes: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) : null,
        sets,
      }
    })
}

// ============================
// Genel giriş noktası
// ============================

export function parseImportCsv(text: string, weightUnit: WeightUnit = 'kg'): CsvParseResult | null {
  const { header, rows } = parseRows(text)
  if (header.length === 0) return null

  const source = detectCsvSource(header)
  if (!source) return null

  const result =
    source === 'strong' ? parseStrong(rows, header, weightUnit)
    : source === 'hevy' ? parseHevy(rows, header)
    : parseFitNotes(rows, header, weightUnit)

  return {
    source,
    workouts: mergeByDay(result.workouts),
    skippedRows: result.skipped,
    warmupSets: result.warmups,
  }
}
