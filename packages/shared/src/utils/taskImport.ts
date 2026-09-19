/**
 * Başka bir araçtaki görev listesini LifeOS görevlerine çevirir.
 *
 * İki biçim:
 *   - Düz liste: her satır bir görev. Madde işaretleri, numaralar ve
 *     Markdown kutucukları ("- [ ] ", "1. ", "• ") ayıklanır; "#" başlıklar atlanır.
 *   - CSV: başlık satırında tanınan bir görev kolonu varsa (Todoist'in CONTENT'i,
 *     Notion'ın Name'i, genel title/görev/başlık) CSV olarak okunur.
 *
 * Saf fonksiyon: ağ yok, tarih "bugün"e göre yorumlanmaz. Emin olunamayan
 * değer (ör. Todoist'in "every monday" gibi doğal dil tarihleri) düşürülür,
 * uydurulmaz.
 */

export interface ImportedTask {
  title: string
  description?: string
  /** YYYY-MM-DD */
  due_date?: string
  /** Kaynakta tamamlanmış görünüyor; arayüz bunları varsayılan olarak seçmez. */
  done: boolean
}

/** Tek içe aktarmada en fazla bu kadar görev. */
export const TASK_IMPORT_LIMIT = 200

const TITLE_MAX = 500

// Adlar fold() sonrası hâliyle yazılır: küçük harf, aksansız ("başlık" -> "baslik")
const TITLE_COLUMNS = ['content', 'title', 'name', 'task', 'task name', 'gorev', 'baslik', 'ad', 'isim']
const DESCRIPTION_COLUMNS = ['description', 'notes', 'note', 'aciklama', 'not', 'notlar']
const DUE_COLUMNS = ['due', 'due date', 'deadline', 'date', 'son tarih', 'tarih', 'bitis']
const STATUS_COLUMNS = ['status', 'done', 'completed', 'durum', 'tamamlandi']
const DONE_VALUES = new Set(['done', 'completed', 'complete', 'tamamlandi', 'bitti', 'yes', 'true', 'evet', 'x', '✓', '✔'])

/** Excel'in UTF-8 CSV'lerinin başına koyduğu byte order mark. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/**
 * Dilden bağımsız karşılaştırma anahtarı. Türkçe küçültme "DESCRIPTION"ı
 * "descrıptıon" yapar, İngilizce küçültme "BAŞLIK"ı "başlik"; ikisini de
 * aksansız ASCII'ye indirip öyle karşılaştırırız.
 */
function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i').toLowerCase().trim()
}

function normalizeHeader(value: string): string {
  return fold(stripBom(value))
}

function cleanTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX)
}

/** Yalnızca belirsizliği olmayan biçimler: 2026-09-20 (ISO, saatli de olur) ve 20.09.2026. */
export function parseImportDate(value: string): string | undefined {
  const text = value.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]|$)/.exec(text)
  const tr = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text)
  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : tr
      ? [Number(tr[3]), Number(tr[2]), Number(tr[1])]
      : [NaN, NaN, NaN]
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return undefined
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** RFC 4180: tırnaklı alan, alan içinde "" kaçışı ve satır sonu. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (char === '"') quoted = false
      else field += char
      continue
    }
    if (char === '"' && field === '') quoted = true
    else if (char === delimiter) { row.push(field); field = '' }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      rows.push(row); row = []
    } else field += char
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''))
}

function findColumn(headers: string[], names: string[]): number {
  return headers.findIndex((header) => names.includes(header))
}

/** Başlık satırında görev kolonu olan ayırıcıyı bulur; yoksa metin CSV değildir. */
function detectCsv(text: string): { delimiter: string; headers: string[] } | null {
  const firstLine = stripBom(text).split(/\r?\n/, 1)[0] ?? ''
  for (const delimiter of [',', ';', '\t']) {
    if (!firstLine.includes(delimiter)) continue
    const headers = (parseCsv(firstLine, delimiter)[0] ?? []).map(normalizeHeader)
    if (findColumn(headers, TITLE_COLUMNS) !== -1) return { delimiter, headers }
  }
  return null
}

function parseCsvTasks(text: string, delimiter: string, headers: string[]): ImportedTask[] {
  const titleAt = findColumn(headers, TITLE_COLUMNS)
  const descriptionAt = findColumn(headers, DESCRIPTION_COLUMNS)
  const dueAt = findColumn(headers, DUE_COLUMNS)
  const statusAt = findColumn(headers, STATUS_COLUMNS)
  // Todoist dışa aktarımında bölüm ve not satırları da var; yalnızca "task" görevdir
  const typeAt = findColumn(headers, ['type'])

  return parseCsv(stripBom(text), delimiter).slice(1).flatMap((cells) => {
    if (typeAt !== -1 && (cells[typeAt] ?? '').trim().toLowerCase() !== 'task') return []
    const title = cleanTitle(cells[titleAt] ?? '')
    if (!title) return []
    const description = descriptionAt === -1 ? '' : (cells[descriptionAt] ?? '').trim()
    const dueDate = dueAt === -1 ? undefined : parseImportDate(cells[dueAt] ?? '')
    const status = statusAt === -1 ? '' : fold(cells[statusAt] ?? '')
    return [{
      title,
      ...(description ? { description } : {}),
      ...(dueDate ? { due_date: dueDate } : {}),
      done: DONE_VALUES.has(status),
    }]
  })
}

const LIST_PREFIX = /^(?:[-*+•▪◦‣]\s+|\d+[.)]\s+)?(?:\[( |x|X)\]\s*|([☐☑✓✔])\s*)?/

function parsePlainTasks(text: string): ImportedTask[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return []
    const match = LIST_PREFIX.exec(trimmed)
    const box = match?.[1] ?? match?.[2]
    const title = cleanTitle(trimmed.slice(match?.[0].length ?? 0))
    if (!title) return []
    return [{ title, done: box === 'x' || box === 'X' || box === '☑' || box === '✓' || box === '✔' }]
  })
}

export interface TaskImportResult {
  tasks: ImportedTask[]
  /** TASK_IMPORT_LIMIT yüzünden alınmayan görev sayısı. */
  overLimit: number
}

/**
 * Yapıştırılan metni ya da dosya içeriğini görevlere çevirir. Aynı başlık
 * (büyük/küçük harf farkı gözetmeden) bir kez alınır, liste
 * TASK_IMPORT_LIMIT'te kesilir.
 */
export function parseTaskImport(text: string): TaskImportResult {
  const csv = detectCsv(text)
  const parsed = csv ? parseCsvTasks(text, csv.delimiter, csv.headers) : parsePlainTasks(text)
  const seen = new Set<string>()
  const unique = parsed.filter((task) => {
    const key = task.title.toLocaleLowerCase('tr-TR')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return {
    tasks: unique.slice(0, TASK_IMPORT_LIMIT),
    overLimit: Math.max(0, unique.length - TASK_IMPORT_LIMIT),
  }
}
