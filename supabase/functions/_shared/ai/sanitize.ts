// supabase/functions/_shared/ai/sanitize.ts
//
// Model çıktısı güvenilmez veridir: alanlar tek tek tipine, aralığına ve izin
// verilen değerlere göre okunur, tutmayan alan düşer. life_setup, daily_report ve
// kural okuyucusu aynı yardımcıları kullanır.

export type RawRecord = Record<string, unknown>

export function isRecord(value: unknown): value is RawRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Tek satır metin: boşluklar tek aralığa iner, karakter sayılarak kesilir (vekil çifti bölünmez). */
export function cleanLine(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return Array.from(value.replace(/\s+/g, ' ').trim()).slice(0, max).join('')
}

/** Satır sonları korunan metin (kullanıcının kendi notu gibi). */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return Array.from(value.trim()).slice(0, max).join('')
}

/** Dizideki metinleri temizler, boşları atar. Dizi değilse boş döner. */
export function cleanList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => cleanLine(item, max)).filter((item) => item !== '')
}

/** İzin verilen değerlerden biri değilse undefined. */
export function pick<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

/** Aralıktaki tam sayı; sayı olmayan, kesirli ya da aralık dışı değer undefined. */
export function intIn(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined
}

/** Sonlu sayıyı yuvarlayıp aralığa sıkıştırır; sayı değilse undefined. */
export function clampInt(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.min(max, Math.max(min, Math.round(value)))
}
