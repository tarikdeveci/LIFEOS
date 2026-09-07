/**
 * Tarih yardımcıları — timezone-safe, Türkçe formatting
 */


/**
 * Cihazın/tarayıcının yerel saatine göre bugünün tarihini döndürür (YYYY-MM-DD).
 * getFullYear/getMonth/getDate yerel saat dilimini otomatik kullanır.
 */
export function todayDate(): string {
  return toDateString(new Date())
}

/**
 * Verilen an için belirtilen IANA timezone'unda takvim tarihi (YYYY-MM-DD).
 */
export function calendarDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  if (!y || !m || !d) {
    return toDateString(date)
  }
  return `${y}-${m}-${d}`
}

/**
 * YYYY-MM-DD string'inden gün kaydırır, yerel saat diliminde hesaplar.
 */
export function shiftIsoDate(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number]
  return toDateString(new Date(y, m - 1, d + deltaDays))
}

/**
 * Postgres TIME / `HH:MM` / `HH:MM:SS` için saat-dakika ayrıştırır.
 */
export function parseClockParts(time: string): { h: number; m: number } {
  const hit = /^(\d{1,2}):(\d{2})/.exec(time.trim())
  if (!hit) return { h: 0, m: 0 }
  return { h: Number(hit[1]), m: Number(hit[2]) }
}

/**
 * Date objesini 'YYYY-MM-DD' string'ine dönüştürür
 */
export function toDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * 'YYYY-MM-DD' string'ini Date objesine dönüştürür (midnight local time)
 */
export function fromDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number) as [number, number, number]
  return new Date(year, month - 1, day)
}

/**
 * Tarihin bugün olup olmadığını kontrol eder
 */
export function isToday(dateStr: string): boolean {
  return dateStr === todayDate()
}

/**
 * Tarihin geçmişte olup olmadığını kontrol eder
 */
export function isPast(dateStr: string): boolean {
  return dateStr < todayDate()
}

/**
 * Tarih için Türkçe kısa etiket döndürür
 */
export function relativeDateLabel(dateStr: string): string {
  const today = todayDate()
  const tomorrow = shiftIsoDate(today, 1)
  const yesterday = shiftIsoDate(today, -1)

  if (dateStr === today) return 'Bugün'
  if (dateStr === tomorrow) return 'Yarın'
  if (dateStr === yesterday) return 'Dün'

  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'long',
    weekday: 'short',
  }).format(fromDateString(dateStr))
}

/**
 * 'HH:MM' formatında şu anki saati döndürür
 */
export function currentTime(): string {
  const now = new Date()
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

/**
 * İki 'HH:MM' zaman arasındaki farkı dakika olarak hesaplar
 */
export function minutesBetween(startTime: string, endTime: string): number {
  const s = parseClockParts(startTime)
  const e = parseClockParts(endTime)
  return e.h * 60 + e.m - (s.h * 60 + s.m)
}

/**
 * 'HH:MM' + dakika → 'HH:MM'. Gün taşarsa 23:59'da durur.
 */
export function addMinutesToClock(time: string, minutes: number): string {
  const { h, m } = parseClockParts(time)
  const total = Math.min(23 * 60 + 59, h * 60 + m + Math.max(0, minutes))
  const hh = String(Math.floor(total / 60)).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * Şu anki yerel saatin YUKARI yuvarlanmış hâli ('HH:MM').
 *
 * Yeni blok/görev formları sabit '09:00' ile açılıyordu. Öğleden sonra bir şey
 * planlayan herkes o alanı elle siliyordu; sabit değer neredeyse hiçbir zaman
 * doğru cevap değil. Şimdiki saatin bir sonraki tam yarım saatine yuvarlamak
 * vakaların çoğunda doğrudan kaydedilebilir bir değer veriyor.
 *
 * Tam bir dilimin üstündeysek (14:00) olduğu gibi kalır; 14:03 → 14:30.
 * Gece geç saatte taşma olmasın diye üst sınır 23:30.
 */
export function nextSlotTime(now: Date = new Date(), stepMinutes = 30): string {
  const step = Math.min(60, Math.max(5, stepMinutes))
  const minutes = now.getHours() * 60 + now.getMinutes()
  const ceiled = Math.ceil(minutes / step) * step
  const capped = Math.min(23 * 60 + 30, ceiled)
  const hh = String(Math.floor(capped / 60)).padStart(2, '0')
  const mm = String(capped % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * Haftanın başlangıç tarihini döndürür (Pazartesi)
 */
export function weekStart(date: Date = new Date()): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day // Pazartesi = 1
  d.setDate(d.getDate() + diff)
  return d
}
