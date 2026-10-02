/**
 * Türkçe doğal dille hızlı görev ekleme. Kural tabanlı, LLM yok, saf fonksiyon.
 *
 *   "yarın 15:00 rapor 30dk"      → yarın, 15:00, 30 dk, "rapor"
 *   "cuma akşam annemi ara"       → bu cuma, 19:00
 *   "haftaya salı sunum"          → gelecek haftanın salısı
 *   "cumaya kadar teklif #iş !4"  → son tarih cuma, etiket iş, efor 4
 *   "15 ekim diş hekimi"          → 15 Ekim
 *
 * Tanınan ifade başlıktan çıkarılır; tanınmayan her şey başlıkta kalır. Emin olunmayan
 * sayı (ör. "3 kitap") dokunulmadan bırakılır. Eski kısayollar (#etiket, !1-5, @bugün,
 * >YYYY-AA-GG) aynen çalışır.
 */

export interface QuickParseResult {
  title: string
  /** Yapılacağı gün (planlanan). */
  scheduled_date?: string
  /** Son tarih ("... kadar", ">tarih"). */
  due_date?: string
  /** HH:MM; varsa gün de dolu olur (yoksa bugün). */
  start_time?: string
  estimated_minutes?: number
  effort_score?: number
  tags: string[]
}

const WEEKDAYS: Record<string, number> = {
  pazar: 0, pazartesi: 1, sali: 2, carsamba: 3, persembe: 4, cuma: 5, cumartesi: 6,
}

const MONTHS: Record<string, number> = {
  ocak: 1, subat: 2, mart: 3, nisan: 4, mayis: 5, haziran: 6,
  temmuz: 7, agustos: 8, eylul: 9, ekim: 10, kasim: 11, aralik: 12,
}

const PART_OF_DAY: Record<string, number> = {
  sabah: 9, 'ogle': 12, 'oglen': 12, 'ogleden sonra': 14, aksam: 19, gece: 21,
}

/** Karşılaştırma için sadeleştirme: küçük harf, Türkçe karakterler ASCII'ye. Uzunluk değişmez. */
function fold(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/[ıİ]/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/â/g, 'a')
}

function iso(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d + n))
  return date.toISOString().slice(0, 10)
}

function weekday(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Bugünden itibaren (bugün dahil) ilk `target` günü. */
function nextWeekday(today: string, target: number): string {
  return addDays(today, (target - weekday(today) + 7) % 7)
}

/** Gelecek haftanın (pazartesi başlangıçlı) `target` günü. */
function weekdayNextWeek(today: string, target: number): string {
  const mondayOffset = (weekday(today) + 6) % 7
  const nextMonday = addDays(today, 7 - mondayOffset)
  return addDays(nextMonday, (target + 6) % 7)
}

/** Ay adı + gün; yıl verilmezse geçmişte kalan tarih bir sonraki yıla atılır. */
function dayMonth(today: string, d: number, m: number, y?: number): string | null {
  const year = y ?? Number(today.slice(0, 4))
  const date = iso(year, m, d)
  if (!date) return null
  if (y === undefined && date < today) return iso(year + 1, m, d)
  return date
}

// Kelime ekleri: "cumaya", "yarına", "ekime", "salıya" gibi yönelme halleri.
const DATIVE = '(?:\u2009?(?:ya|ye|na|ne|a|e))?'
const W = '(?<![\\p{L}\\d])'
const E = '(?![\\p{L}\\d])'

interface Match { start: number; end: number; date: string }

/** Metinde ilk tarih ifadesini bulur (folded metin üzerinde; uzunluk korunur). */
function findDate(folded: string, today: string): Match | null {
  const candidates: Match[] = []
  const push = (re: RegExp, toDate: (m: RegExpExecArray) => string | null) => {
    const m = re.exec(folded)
    if (!m) return
    const date = toDate(m)
    if (date) candidates.push({ start: m.index, end: m.index + m[0].length, date })
  }

  push(new RegExp(`${W}(\\d{4})-(\\d{2})-(\\d{2})${E}`, 'u'), (m) => iso(+m[1]!, +m[2]!, +m[3]!))
  push(new RegExp(`${W}(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{4}))?${DATIVE}${E}`, 'u'),
    (m) => dayMonth(today, +m[1]!, +m[2]!, m[3] ? +m[3] : undefined))
  push(new RegExp(`${W}(\\d{1,2})\\s+(${Object.keys(MONTHS).join('|')})${DATIVE}(?:\\s+(\\d{4}))?${E}`, 'u'),
    (m) => dayMonth(today, +m[1]!, MONTHS[m[2]!]!, m[3] ? +m[3] : undefined))
  push(new RegExp(`${W}(?:obur gun|ertesi gun|yarindan sonra)${DATIVE}${E}`, 'u'), () => addDays(today, 2))
  push(new RegExp(`${W}bugun${DATIVE}${E}`, 'u'), () => today)
  push(new RegExp(`${W}yarin${DATIVE}${E}`, 'u'), () => addDays(today, 1))
  push(new RegExp(`${W}(\\d{1,2})\\s+(gun|hafta)\\s+sonra${E}`, 'u'),
    (m) => addDays(today, +m[1]! * (m[2] === 'hafta' ? 7 : 1)))
  push(new RegExp(`${W}(?:haftaya|gelecek hafta|onumuzdeki hafta)\\s+(${Object.keys(WEEKDAYS).join('|')})${DATIVE}${E}`, 'u'),
    (m) => weekdayNextWeek(today, WEEKDAYS[m[1]!]!))
  push(new RegExp(`${W}(?:gelecek hafta|onumuzdeki hafta)${DATIVE}${E}(?!\\s+(?:${Object.keys(WEEKDAYS).join('|')}))`, 'u'),
    () => weekdayNextWeek(today, 1))
  push(new RegExp(`${W}haftaya${E}(?!\\s+(?:${Object.keys(WEEKDAYS).join('|')}))`, 'u'), () => addDays(today, 7))
  push(new RegExp(`${W}hafta\\s?sonu${DATIVE}${E}`, 'u'), () => nextWeekday(today, 6))
  push(new RegExp(`${W}ay\\s?sonu${DATIVE}${E}`, 'u'), () => {
    const [y, m] = today.split('-').map(Number) as [number, number]
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  })
  // Gün adı: en uzun ad önce ("cumartesi" "cuma"dan, "pazartesi" "pazar"dan önce).
  const names = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|')
  push(new RegExp(`${W}(${names})${DATIVE}${E}`, 'u'), (m) => nextWeekday(today, WEEKDAYS[m[1]!]!))

  if (candidates.length === 0) return null
  // Metinde en önce ve en uzun olan kazanır ("haftaya salı" > "salı").
  candidates.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start))
  return candidates[0]!
}

const SHORTCUTS: Record<string, string> = { today: 'bugün', tomorrow: 'yarın' }

/** "akşam 7" → 19, "öğlen 1" → 13, "sabah 9" → 9, "gece 11" → 23, "gece 1" → 1 */
function toPartOfDay(part: string, h: number): number {
  return PART_OF_DAY[part]! >= 12 && h < 12 && !(part === 'gece' && h < 5) ? h + 12 : h
}

function cut(text: string, folded: string, start: number, end: number): [string, string] {
  return [text.slice(0, start) + ' ' + text.slice(end), folded.slice(0, start) + ' ' + folded.slice(end)]
}

export function parseQuickTask(input: string, today: string): QuickParseResult {
  let text = input.replace(/\s+/g, ' ').trim()
  const result: QuickParseResult = { title: '', tags: [] }

  // --- Eski kısayollar (ham metin üzerinde)
  text = text.replace(/#([\p{L}\d_-]+)/gu, (_, tag: string) => { result.tags.push(tag); return ' ' })
  text = text.replace(/(?:^|\s)!([1-5])(?=\s|$)/, (_, n: string) => { result.effort_score = Number(n); return ' ' })
  text = text.replace(/(?:^|\s)>(\d{4}-\d{2}-\d{2})(?=\s|$)/, (_, d: string) => {
    if (iso(+d.slice(0, 4), +d.slice(5, 7), +d.slice(8, 10))) result.due_date = d
    return ' '
  })
  // "@tomorrow" ve "@today" eski İngilizce kısayollar; tarih ayrıştırıcısı Türkçe karşılığını tanır.
  text = text.replace(/(?:^|\s)@(\S+)/, (_, v: string) => ` ${SHORTCUTS[v.toLowerCase()] ?? v} `)

  // Kesme işareti ince boşluğa çevrilir ("cuma'ya", "15'te"); fold uzunluğu korur, indeksler iki metinde aynı.
  text = text.replace(/['’]/g, '\u2009')
  let folded = fold(text)

  // --- Süre: "30dk", "30 dakika", "1,5 saat", "2 sa" (saat 3 zaman ifadesidir, süre değil)
  {
    const re = new RegExp(`${W}(\\d{1,3}(?:[.,]\\d)?)\\s*(dk|dak|dakika|min|saat|sa)${E}`, 'u')
    const m = re.exec(folded)
    if (m && !(m[2] === 'saat' && /saat\s*$/.test(folded.slice(0, m.index)))) {
      const n = Number(m[1]!.replace(',', '.'))
      const minutes = m[2]!.startsWith('d') || m[2] === 'min' ? n : n * 60
      if (minutes >= 5 && minutes <= 720) {
        result.estimated_minutes = Math.round(minutes)
        ;[text, folded] = cut(text, folded, m.index, m.index + m[0].length)
      }
    }
  }

  // --- Tarih (+ "kadar" ise son tarih)
  const date = findDate(folded, today)
  if (date) {
    const after = folded.slice(date.end)
    const until = /^\s*kadar(?![\p{L}\d])/u.exec(after)
    const end = date.end + (until ? until[0].length : 0)
    if (until) result.due_date = date.date
    else result.scheduled_date = date.date
    ;[text, folded] = cut(text, folded, date.start, end)
  }

  // --- Saat: "15:00", "saat 15", "saat 3", "15te", "akşam 7", "cuma akşam"
  {
    let hour: number | undefined
    let minute = 0
    // Önündeki gün bölümü saate dahil: "akşam 7:30" 07:30 değil 19:30, "akşam" da başlıkta kalmaz.
    const clock = new RegExp(`${W}(?:(ogleden sonra|sabah|oglen|ogle|aksam|gece)\\s+)?(?:saat\\s*)?([01]?\\d|2[0-3]):([0-5]\\d)(?:\\s*(?:da|de|ta|te))?${E}`, 'u').exec(folded)
    const part = new RegExp(`${W}(ogleden sonra|sabah|oglen|ogle|aksam|gece)(?:\\s+(?:saat\\s*)?(\\d{1,2})(?:\\s*(?:da|de|ta|te))?)?${E}`, 'u').exec(folded)
    const saat = new RegExp(`${W}saat\\s*(\\d{1,2})(?:\\s*(?:da|de|ta|te))?${E}`, 'u').exec(folded)
    const suffixed = new RegExp(`${W}(\\d{1,2})\\s*(?:da|de|ta|te)${E}`, 'u').exec(folded)

    let span: RegExpExecArray | null = null
    if (clock) {
      hour = +clock[2]!; minute = +clock[3]!; span = clock
      if (clock[1]) hour = toPartOfDay(clock[1], hour)
    } else if (part && (part[2] || date)) {
      // Tek başına "akşam" sadece bir günle birlikte saat sayılır ("akşam yemeği" başlıktır).
      const base = PART_OF_DAY[part[1]!]!
      hour = part[2] ? toPartOfDay(part[1]!, +part[2]) : base
      span = part
    } else if (saat || suffixed) {
      const m = (saat ?? suffixed)!
      const h = +m[1]!
      // Bağlamsız 1-7 arası öğleden sonra kabul edilir ("saat 3" → 15:00).
      if (h <= 23) { hour = h >= 1 && h <= 7 ? h + 12 : h; span = m }
    }
    if (hour !== undefined && span && hour <= 23) {
      result.start_time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
      ;[text, folded] = cut(text, folded, span.index, span.index + span[0].length)
      if (!result.scheduled_date) result.scheduled_date = result.due_date ?? today
    }
  }

  result.title = text.replace(/\u2009/g, "'").replace(/\s+/g, ' ').replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '').trim()
  if (!result.title) result.title = input.trim()
  return result
}
