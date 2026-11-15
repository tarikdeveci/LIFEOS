/**
 * Tarih ve saat seçicinin değer dönüşümleri. Formlar değeri metin olarak tutar
 * ('YYYY-MM-DD', 'HH:MM'); seçici Date ister. Hepsi yerel saatle çalışır.
 */

const TIME_RE = /^(\d{2}):(\d{2})$/
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/

const pad = (n: number) => String(n).padStart(2, '0')

function parseTime(value: string): [number, number] | null {
  const m = TIME_RE.exec(value)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  return h < 24 && min < 60 ? [h, min] : null
}

/** Saat seçicinin günü: yaz saati geçişi olmayan sabit bir gün, yoksa 02:30 gibi saatler kayar. */
const TIME_BASE = new Date(2001, 0, 1, 12)

/** 'HH:MM' değerini `base` gününün o saatine çevirir; değer bozuksa `fallback` saati. */
export function timeToDate(value: string, base: Date = TIME_BASE, fallback = '09:00'): Date {
  const [h, min] = parseTime(value) ?? parseTime(fallback) ?? [9, 0]
  const d = new Date(base)
  d.setHours(h, min, 0, 0)
  return d
}

export function dateToTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 'YYYY-MM-DD' değerini yerel öğlene çevirir (yaz saati geçişinde gün kaymasın); takvimde olmayan günde null. */
export function isoToDate(value: string): Date | null {
  const m = ISO_RE.exec(value)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const day = Number(m[3])
  const d = new Date(y, mo, day, 12, 0, 0, 0)
  return d.getFullYear() === y && d.getMonth() === mo && d.getDate() === day ? d : null
}

export function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
