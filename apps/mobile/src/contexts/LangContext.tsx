import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getTranslations, type Language, type Translations, LANG_STORAGE_KEY } from '../i18n'
import { deviceLocale, resolveLanguage } from '../utils/language'

interface LangContextValue {
  lang: Language
  setLang: (l: Language) => void
  t: Translations
}

// Kayıtlı seçim okunana kadar cihaz dili geçerli (#1). Bileşen dışı kod (bildirim,
// AI istekleri, uyarılar) dili `getCurrentLang` / `getCurrentT` ile okur.
let currentLang: Language = resolveLanguage(null, deviceLocale())

export function getCurrentLang(): Language {
  return currentLang
}

export function getCurrentT(): Translations {
  return getTranslations(currentLang)
}

/** Provider dışında (widget, arka plan görevi) kayıtlı seçimi de hesaba katar. */
export async function loadStoredLang(): Promise<Language> {
  const stored = await AsyncStorage.getItem(LANG_STORAGE_KEY).catch(() => null)
  currentLang = resolveLanguage(stored, deviceLocale())
  return currentLang
}

const LangContext = createContext<LangContextValue>({
  lang: currentLang,
  setLang: () => {},
  t: getTranslations(currentLang),
})

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(currentLang)

  useEffect(() => {
    void loadStoredLang().then(setLangState)
  }, [])

  function setLang(l: Language) {
    currentLang = l
    setLangState(l)
    void AsyncStorage.setItem(LANG_STORAGE_KEY, l)
  }

  // t is recomputed on every lang change — any component calling useLang() re-renders
  const t = getTranslations(lang)

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() {
  return useContext(LangContext)
}
