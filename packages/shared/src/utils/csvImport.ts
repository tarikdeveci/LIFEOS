/**
 * Strong / Hevy / FitNotes antrenman geçmişi CSV içe aktarma.
 *
 * Saf ayrıştırma burada; DB yazımı (egzersiz eşleştirme/oluşturma, workout ve
 * set insert'leri) supabase/workouts.ts:importCsvWorkouts içinde. Üç format da
 * hücre başına virgül kullanıyor; tırnaklı alanlar (Notes/Comment sütunlarında
 * virgül veya satır içi metin) RFC 4180'e yakın basit bir ayrıştırıcıyla çözülüyor
 * — üçü de yaygın kütüphanelerle (PapaParse vb.) üretildiği için ekstra kaçış
 * karakteri (\"\"\") ihtimaline karşı onu da destekliyoruz.
 *
 * Format tespiti başlık satırındaki sütun adlarından yapılır; kesin export
 * şeması üç uygulamada da zamanla değişebiliyor, o yüzden eşleşme TAM değil
 * "gerekli sütunların hepsi var mı" şeklinde — küçük başlık farkları formatı
 * kırmasın diye.
 */

export type CsvImportSource = 'strong' | 'hevy' | 'fitnotes'
export type WeightUnit = 'kg' | 'lb'

const LB_TO_KG = 0.45359237

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
  workouts: ParsedImportWorkout[]
  /** Ayrıştırılamadığı için atlanan satır sayısı (bozuk tarih, boş egzersiz adı vb.) */
  skippedRows: number
}

// ============================
// CSV satır ayrıştırma
// ============================

function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      cells.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current)
  return cells.map((c) => c.trim())
}

function parseRows(text: string): { header: string[]; rows: string[][] } {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return { header: [], rows: [] }
  const header = splitCsvLine(lines[0]!).map((h) => h.trim())
  const rows = lines.slice(1).map(splitCsvLine)
  return { header, rows }
}

function rowToRecord(header: string[], row: string[]): Record<string, string> {
  const record: Record<string, string> = {}
  header.forEach((key, i) => {
    record[key] = row[i] ?? ''
  })
  return record
}

// ============================
// Sayı / tarih yardımcıları
// ============================

function parseNumber(value: string | undefined): number | null {
  if (!value) return null
  const cleaned = value.replace(',', '.').trim()
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

/** Set Order/set_index alanındaki baştaki tam sayıyı alır; "W1" gibi ısınma işaretlerini yok sayar. */
function parseSetNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const match = /\d+/.exec(value)
  return match ? Number.parseInt(match[0]!, 10) : fallback
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function toIsoDate(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** "2024-01-08 14:32:00", "2024-01-08", "8 Jan 2024, 14:32" gibi biçimleri kabul eder. */
function parseFlexibleDate(value: string | undefined): Date | null {
  if (!value) return null
  const trimmed = value.trim()
  // FitNotes/Strong: 'YYYY-MM-DD' başlangıçlı — yerel saat dilimi kaymasın diye elle kurulur.
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed)
  if (isoMatch) {
    const [, y, m, d] = isoMatch
    return new Date(Number(y), Number(m) - 1, Number(d))
  }
  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toKg(value: number | null, unit: WeightUnit): number | null {
  if (value === null) return null
  return unit === 'lb' ? Math.round(value * LB_TO_KG * 100) / 100 : value
}

// ============================
// Format tespiti
// ============================

export function detectCsvSource(header: string[]): CsvImportSource | null {
  const has = (name: string) => header.includes(name)

  if (has('exercise_title') && has('set_index') && (has('weight_kg') || has('weight_lbs'))) {
    return 'hevy'
  }
  if (has('Workout Name') && has('Exercise Name') && has('Set Order')) {
    return 'strong'
  }
  // FitNotes'ta workout/set gruplama sütunu yok — Exercise + Category ikilisi ayırt edici.
  if (has('Exercise') && has('Category') && has('Weight') && has('Reps')) {
    return 'fitnotes'
  }
  return null
}

// ============================
// Format bazlı ayrıştırma
// ============================

interface WorkoutAccumulator {
  date: string
  name: string
  durationMinutes: number | null
  sets: ParsedImportSet[]
  setCounters: Map<string, number>
}

function nextSetNumber(acc: WorkoutAccumulator, exerciseName: string, explicit: string | undefined): number {
  const count = (acc.setCounters.get(exerciseName) ?? 0) + 1
  acc.setCounters.set(exerciseName, count)
  return parseSetNumber(explicit, count)
}

function parseStrong(rows: string[][], header: string[], unit: WeightUnit): { workouts: ParsedImportWorkout[]; skipped: number } {
  const groups = new Map<string, WorkoutAccumulator>()
  let skipped = 0

  for (const row of rows) {
    const r = rowToRecord(header, row)
    const date = parseFlexibleDate(r['Date'])
    const exerciseName = r['Exercise Name']?.trim()
    if (!date || !exerciseName) {
      skipped += 1
      continue
    }
    const isoDate = toIsoDate(date)!
    const workoutName = r['Workout Name']?.trim() || 'İçe Aktarılan Antrenman'
    const key = `${r['Date']}|${workoutName}`

    let acc = groups.get(key)
    if (!acc) {
      acc = { date: isoDate, name: workoutName, durationMinutes: parseDurationMinutes(r['Duration']), sets: [], setCounters: new Map() }
      groups.set(key, acc)
    }

    acc.sets.push({
      exerciseName,
      setNumber: nextSetNumber(acc, exerciseName, r['Set Order']),
      weightKg: toKg(parseNumber(r['Weight']), unit),
      reps: parseNumber(r['Reps']),
      durationSeconds: parseNumber(r['Seconds']),
      distanceM: parseNumber(r['Distance']),
    })
  }

  return { workouts: [...groups.values()], skipped }
}

/** "45min", "1h 5min", "45" gibi biçimleri dakikaya çevirir. */
function parseDurationMinutes(value: string | undefined): number | null {
  if (!value) return null
  const trimmed = value.trim()
  const plain = parseNumber(trimmed)
  if (plain !== null && !/[a-zA-Zğüşıöç]/.test(trimmed)) return Math.round(plain)

  const hourMatch = /(\d+)\s*h/i.exec(trimmed)
  const minMatch = /(\d+)\s*m/i.exec(trimmed)
  const hours = hourMatch ? Number.parseInt(hourMatch[1]!, 10) : 0
  const mins = minMatch ? Number.parseInt(minMatch[1]!, 10) : 0
  return hours || mins ? hours * 60 + mins : null
}

function parseHevy(rows: string[][], header: string[]): { workouts: ParsedImportWorkout[]; skipped: number } {
  const groups = new Map<string, WorkoutAccumulator>()
  let skipped = 0
  const hasKg = header.includes('weight_kg')

  for (const row of rows) {
    const r = rowToRecord(header, row)
    const start = parseFlexibleDate(r['start_time'])
    const exerciseName = r['exercise_title']?.trim()
    if (!start || !exerciseName) {
      skipped += 1
      continue
    }
    const end = parseFlexibleDate(r['end_time'])
    const isoDate = toIsoDate(start)!
    const workoutName = r['title']?.trim() || 'İçe Aktarılan Antrenman'
    const key = `${r['start_time']}|${workoutName}`

    let acc = groups.get(key)
    if (!acc) {
      const durationMinutes = end ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000)) : null
      acc = { date: isoDate, name: workoutName, durationMinutes, sets: [], setCounters: new Map() }
      groups.set(key, acc)
    }

    const weightRaw = hasKg ? parseNumber(r['weight_kg']) : toKg(parseNumber(r['weight_lbs']), 'lb')
    const distanceKm = parseNumber(r['distance_km'])

    acc.sets.push({
      exerciseName,
      setNumber: nextSetNumber(acc, exerciseName, r['set_index']),
      weightKg: weightRaw,
      reps: parseNumber(r['reps']),
      durationSeconds: parseNumber(r['duration_seconds']),
      distanceM: distanceKm !== null ? Math.round(distanceKm * 1000) : null,
    })
  }

  return { workouts: [...groups.values()], skipped }
}

function parseFitNotes(rows: string[][], header: string[], unit: WeightUnit): { workouts: ParsedImportWorkout[]; skipped: number } {
  // FitNotes bir antrenmanı ayrı satır grubu olarak işaretlemiyor — aynı takvim
  // gününün tüm satırları tek antrenman sayılır (gerçek uygulama davranışına en yakını).
  const groups = new Map<string, WorkoutAccumulator>()
  let skipped = 0

  for (const row of rows) {
    const r = rowToRecord(header, row)
    const date = parseFlexibleDate(r['Date'])
    const exerciseName = r['Exercise']?.trim()
    if (!date || !exerciseName) {
      skipped += 1
      continue
    }
    const isoDate = toIsoDate(date)!

    let acc = groups.get(isoDate)
    if (!acc) {
      acc = { date: isoDate, name: 'İçe Aktarılan Antrenman', durationMinutes: null, sets: [], setCounters: new Map() }
      groups.set(isoDate, acc)
    }

    const distance = parseNumber(r['Distance'])
    acc.sets.push({
      exerciseName,
      setNumber: nextSetNumber(acc, exerciseName, undefined),
      weightKg: toKg(parseNumber(r['Weight']), unit),
      reps: parseNumber(r['Reps']),
      durationSeconds: parseTimeToSeconds(r['Time']),
      distanceM: distance !== null ? Math.round(distance * 1000) : null,
    })
  }

  return { workouts: [...groups.values()], skipped }
}

/** FitNotes 'Time' sütunu "mm:ss" ya da saniye olabilir. */
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

  // Boş set listesiyle kalan antrenmanlar (tamamı bozuk satırdan geldiyse) atlanır.
  const workouts = result.workouts.filter((w) => w.sets.length > 0)

  return { source, workouts, skippedRows: result.skipped }
}

// ============================
// Egzersiz adı eşleştirme
// ============================

/** Türkçe aksan/noktalama farklarını eleyerek karşılaştırılabilir hale getirir. */
export function foldExerciseName(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * İçe aktarılan bir egzersiz adını katalogla eşler. Önce tam eşleşme (name/name_en),
 * sonra alt dize içerme denenir — CSV'lerdeki "Bench Press (Barbell)" gibi varyant
 * ekleri tam eşleşmeyi kaçırdığında en azından makul bir aday bulunsun diye.
 * Eşleşme yoksa null: çağıran taraf kullanıcının kendi egzersizi olarak oluşturur.
 */
export function matchExerciseName<T extends { name: string; name_en: string | null }>(
  importedName: string,
  candidates: readonly T[],
): T | null {
  const folded = foldExerciseName(importedName)
  if (!folded) return null

  for (const candidate of candidates) {
    if (foldExerciseName(candidate.name) === folded) return candidate
    if (candidate.name_en && foldExerciseName(candidate.name_en) === folded) return candidate
  }
  for (const candidate of candidates) {
    const candFolded = foldExerciseName(candidate.name_en ?? candidate.name)
    if (candFolded.length > 3 && (folded.includes(candFolded) || candFolded.includes(folded))) return candidate
  }
  return null
}
