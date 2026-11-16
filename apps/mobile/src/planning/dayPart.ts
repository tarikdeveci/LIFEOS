import type { DayPart } from '@lifeos/shared'

/** Gün bölümleri ekrandaki sırasıyla (084). */
export const DAY_PARTS: DayPart[] = ['morning', 'noon', 'afternoon', 'evening']

/** Gün bölümünün çeviri anahtarı. */
export const dayPartKey = (part: DayPart) => `day_part_${part}` as const
