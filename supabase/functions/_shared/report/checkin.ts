// Kapanış işaretlerinin (DayCheckin) doğrulanması ve temizlenmesi. Saf, importsuz.
// "Yaptım" buraya yazılmaz: o gerçek tamamlamadır (görev done, blok completed_at,
// alışkanlık işareti). Burada yalnızca yarım ve olmadı kalır.

import type { DayCheckin, DayItem, SkipReason } from './types.ts'

export const CHECKIN_MAX_ITEMS = 100

const REASONS: readonly string[] = ['energy', 'time', 'interrupted', 'not_needed', 'avoided']
const OUTCOMES: readonly string[] = ['partial', 'skipped']
const ITEM_KEY = /^(task|block|habit):[0-9A-Za-z-]{1,64}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** İstemciden gelen kapanış gövdesi. Biçim bozuksa null (çağıran 400 döner). */
export function parseCheckin(raw: unknown): DayCheckin | null {
  if (!isRecord(raw)) return null
  const out: DayCheckin = {}

  if (raw['items'] !== undefined) {
    if (!isRecord(raw['items'])) return null
    const entries = Object.entries(raw['items'])
    if (entries.length > CHECKIN_MAX_ITEMS) return null
    const items: NonNullable<DayCheckin['items']> = {}
    for (const [key, value] of entries) {
      if (!ITEM_KEY.test(key) || !isRecord(value)) return null
      const outcome = value['outcome']
      const reason = value['reason']
      if (typeof outcome !== 'string' || !OUTCOMES.includes(outcome)) return null
      if (reason !== undefined && reason !== null && (typeof reason !== 'string' || !REASONS.includes(reason))) return null
      items[key] = {
        outcome: outcome as 'partial' | 'skipped',
        ...(typeof reason === 'string' ? { reason: reason as SkipReason } : {}),
      }
    }
    out.items = items
  }
  return out
}

/** Günde olmayan öğelerin işaretlerini atar (gün yeniden hesaplanınca öğe düşmüş olabilir). */
export function pruneCheckin(checkin: DayCheckin, items: readonly DayItem[]): DayCheckin {
  if (!checkin.items) return checkin
  const keys = new Set(items.map((i) => i.key))
  const kept = Object.fromEntries(Object.entries(checkin.items).filter(([key]) => keys.has(key)))
  const next = { ...checkin }
  delete next.items
  return Object.keys(kept).length > 0 ? { ...next, items: kept } : next
}
