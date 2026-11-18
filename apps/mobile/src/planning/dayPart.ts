import type { DayPart } from '@lifeos/shared'

/** Gün bölümünün çeviri anahtarı. */
export const dayPartKey = (part: DayPart) => `day_part_${part}` as const
