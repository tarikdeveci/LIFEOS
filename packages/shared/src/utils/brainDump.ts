// Beyin boşaltma: serbest metni (konuşmadan yazıya ya da elle) görev adaylarına böler.
// Ücretsiz yol kural tabanlıdır; her parça parseQuickTask'tan geçer. Pro'da aynı metin
// ai-suggest `brain_dump` moduna gider ve dönen liste aynı biçime getirilir.

import { parseQuickTask, type QuickParseResult } from './quickParse'

export const BRAIN_DUMP_MAX_CHARS = 4000
const BRAIN_DUMP_MAX_ITEMS = 30

// Satır başı madde işaretleri: "-", "*", "•", "1.", "2)".
const BULLET = /^\s*(?:[-*•·]|\d{1,2}[.)])\s+/
// Cümle sonu: nokta, ünlem, soru işareti ve ardından boşluk. "15.30" gibi saatler bölünmez.
const SENTENCE_END = /(?<=[.!?])\s+(?=\S)/
// Konuşmada sık görülen bağlaçlar parçayı ayırır ("... sonra ...", "... bir de ...").
const SPOKEN_JOINERS = /\s+(?:ve sonra|sonra da|ondan sonra|bir de|ayrıca|bi de)\s+/i

/** Metni görev adayı parçalara böler; boş ve çok kısa parçalar atılır. */
export function splitBrainDump(text: string): string[] {
  const out: string[] = []
  for (const line of text.slice(0, BRAIN_DUMP_MAX_CHARS).split(/\r?\n|;/)) {
    const clean = line.replace(BULLET, '').trim()
    if (!clean) continue
    for (const sentence of clean.split(SENTENCE_END)) {
      for (const part of sentence.split(SPOKEN_JOINERS)) {
        const item = part.replace(/[.!?,\s]+$/, '').trim()
        if (item.length >= 2) out.push(item)
      }
    }
  }
  return out.slice(0, BRAIN_DUMP_MAX_ITEMS)
}

/** Ücretsiz yol: her parça hızlı ekleme ayrıştırıcısından geçer (tarih, saat, süre, etiket). */
export function parseBrainDump(text: string, today: string): QuickParseResult[] {
  return splitBrainDump(text)
    .map((part) => parseQuickTask(part, today))
    .filter((r) => r.title.trim().length > 0)
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/** Biçim yetmez: "2026-02-31" kayıtta hata verir ve sıralı toplu kaydı ortasında keser. */
function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const time = Date.parse(`${value}T00:00:00Z`)
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value
}

/**
 * AI yanıtını güvenli biçime getirir: bilinmeyen alan atılır, geçersiz tarih/saat
 * düşer, başlık kırpılır. Model ne döndürürse döndürsün istemci bu listeye güvenir.
 */
export function sanitizeBrainDumpItems(raw: unknown): QuickParseResult[] {
  if (!Array.isArray(raw)) return []
  const out: QuickParseResult[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const rec = item as Record<string, unknown>
    const title = typeof rec.title === 'string' ? rec.title.trim().slice(0, 200) : ''
    if (!title) continue
    const result: QuickParseResult = { title, tags: [] }
    if (isCalendarDate(rec.scheduled_date)) result.scheduled_date = rec.scheduled_date
    if (isCalendarDate(rec.due_date)) result.due_date = rec.due_date
    if (typeof rec.start_time === 'string' && TIME_RE.test(rec.start_time) && result.scheduled_date) {
      result.start_time = rec.start_time
    }
    if (typeof rec.estimated_minutes === 'number' && rec.estimated_minutes >= 5 && rec.estimated_minutes <= 600) {
      result.estimated_minutes = Math.round(rec.estimated_minutes)
    }
    if (Array.isArray(rec.tags)) {
      result.tags = rec.tags
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.trim().toLocaleLowerCase('tr-TR').replace(/^#/, '').slice(0, 30))
        .filter(Boolean)
        .slice(0, 5)
    }
    out.push(result)
    if (out.length >= BRAIN_DUMP_MAX_ITEMS) break
  }
  return out
}
