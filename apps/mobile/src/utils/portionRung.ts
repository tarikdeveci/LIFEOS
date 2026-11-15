import type { PortionRung } from '@lifeos/shared'

import type { uxEn } from '../i18nUx'

type PortionKey = Extract<keyof typeof uxEn, `ux_nut_portion_${string}`>

/** Porsiyon kaynağını kullanıcıya gösterilecek çevrilmiş etikete çevirir; ham enum değeri ekrana çıkmaz (#37). */
export function portionRungLabel(
  t: Record<PortionKey, string>,
  rung: PortionRung | undefined,
): string {
  return t[`ux_nut_portion_${rung ?? 'unknown'}`]
}
