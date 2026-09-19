/**
 * Zaman bloklarından RFC 5545 takvim dosyası üretir. Saf fonksiyonlar: ağ ve
 * veritabanı yok, "şimdi" dışarıdan verilir.
 *
 * Bloklar kullanıcının yerel gün ve saatiyle saklanır (date + start_time).
 * Saatler UTC'ye çevrilip "Z" ile yazılır: TZID kullanmak her takvimde
 * VTIMEZONE tanımı ister ve Outlook IANA adlarını her zaman tanımaz.
 */

export interface FeedBlock {
  id: string
  /** YYYY-MM-DD, kullanıcının yerel günü */
  date: string
  /** HH:MM ya da HH:MM:SS */
  start: string
  end: string
  title: string
  category: string
  completed: boolean
  updatedAt: string | null
}

export interface CalendarInput {
  name: string
  timeZone: string
  url: string
  blocks: FeedBlock[]
  now: Date
}

const FALLBACK_TIME_ZONE = 'Europe/Istanbul'
const encoder = new TextEncoder()

/** Geçersiz ya da boş saat dilimi adında varsayılana döner (Intl RangeError atar). */
export function safeTimeZone(value: unknown): string {
  if (typeof value !== 'string' || !value) return FALLBACK_TIME_ZONE
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return value
  } catch {
    return FALLBACK_TIME_ZONE
  }
}

/** Verilen andaki saat dilimi farkı (ms). Yaz saati geçişlerini de kapsar. */
function offsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instant))
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'))
  return asUtc - Math.floor(instant / 1000) * 1000
}

/** Yerel gün ve saati (duvar saati) o saat dilimindeki gerçek ana çevirir. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  const [hour = 0, minute = 0, second = 0] = time.split(':').map(Number)
  const wall = Date.UTC(year, month - 1, day, hour, minute, second)
  // İkinci tur: ilk tahmin yaz saati sınırının öbür yanına düşmüş olabilir
  const guess = wall - offsetMs(wall, timeZone)
  return new Date(wall - offsetMs(guess, timeZone))
}

/** Bir anın o saat dilimindeki takvim günü, YYYY-MM-DD. */
export function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant)
}

export function addDays(date: string, days: number): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

function formatUtc(instant: Date): string {
  return instant.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** TEXT değerlerinde ters bölü, noktalı virgül, virgül ve satır sonu kaçışlanır. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** 75 byte'ı aşan satır bölünür; çok byte'lı karakter (ş, ğ, emoji) ortadan kesilmez. */
export function foldLine(line: string): string {
  const chunks: string[] = []
  let current = ''
  let bytes = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    if (bytes + size > 75) {
      chunks.push(current)
      current = ' '
      bytes = 1
    }
    current += char
    bytes += size
  }
  chunks.push(current)
  return chunks.join('\r\n')
}

function eventLines(block: FeedBlock, input: CalendarInput, stamp: string): string[] {
  const start = zonedToUtc(block.date, block.start, input.timeZone)
  const end = zonedToUtc(block.date, block.end, input.timeZone)
  const updated = block.updatedAt ? new Date(block.updatedAt) : null
  return [
    'BEGIN:VEVENT',
    `UID:${block.id}@lifeos.tr`,
    `DTSTAMP:${stamp}`,
    ...(updated && !Number.isNaN(updated.getTime()) ? [`LAST-MODIFIED:${formatUtc(updated)}`] : []),
    `DTSTART:${formatUtc(start)}`,
    `DTEND:${formatUtc(end)}`,
    `SUMMARY:${escapeText(block.completed ? `✓ ${block.title}` : block.title)}`,
    `CATEGORIES:${escapeText(block.category)}`,
    `URL:${input.url}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
  ]
}

export function buildCalendar(input: CalendarInput): string {
  const stamp = formatUtc(input.now)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LifeOS//Zaman Bloklari//TR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(input.name)}`,
    `X-WR-TIMEZONE:${input.timeZone}`,
    // Takvim uygulamasına saatte bir yenilemesini önerir; Google bunu yok sayıp
    // kendi aralığında (birkaç saat) çeker.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...input.blocks.flatMap((block) => eventLines(block, input, stamp)),
    'END:VCALENDAR',
  ]
  return lines.map(foldLine).join('\r\n') + '\r\n'
}
