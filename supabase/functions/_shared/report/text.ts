// Rapor ve bildirim metinleri için küçük yardımcılar. Saf, importsuz.
//
// Seçim deterministik (daily-digest/copy.ts ile aynı desen): aynı gün aynı metin,
// ertesi gün havuzda bir sonrakine geçer. Yazım: sayıdan sonra ek yok.

export type ReportLanguage = 'tr' | 'en'

export function pick<T>(list: readonly T[], seed: number): T {
  const item = list[((seed % list.length) + list.length) % list.length]
  if (item === undefined) throw new Error('bos metin havuzu')
  return item
}

/** Haftanın gününe özel metin varsa iki günden birinde onu kullanır, yoksa havuzdan seçer. */
export function withSpecial(special: string | null, pool: readonly string[], seed: number): string {
  return special !== null && seed % 2 === 0 ? special : pick(pool, seed)
}

/** "{ad}" yer tutucularını doldurur. */
export function fill(template: string, vars: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''))
}

export function clip(text: string, max: number): string {
  const clean = text.trim().replace(/\s+/g, ' ')
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

export function lines(...parts: Array<string | null>): string {
  return parts.filter((p): p is string => p !== null && p !== '').join('\n')
}
