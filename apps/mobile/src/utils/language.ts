/**
 * Arayüz dilinin seçimi (#1). Saf fonksiyonlar: React ve native modül yok, testte çalışır.
 * Cihaz dili `Intl` ile okunur (saat dilimi de böyle okunuyor), yeni native modül gerekmez.
 */

export type Lang = 'en' | 'tr'

/** Kullanıcının kayıtlı seçimi varsa o; yoksa cihaz dili Türkçe ise tr, değilse en. */
export function resolveLanguage(stored: string | null | undefined, deviceLocale: string | undefined): Lang {
  if (stored === 'en' || stored === 'tr') return stored
  return /^tr(\b|[-_])/i.test(deviceLocale ?? '') ? 'tr' : 'en'
}

export function deviceLocale(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale
  } catch {
    return undefined
  }
}
