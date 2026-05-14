import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getTranslations, type Language, type Translations, LANG_STORAGE_KEY } from '../i18n'

interface LangContextValue {
  lang: Language
  setLang: (l: Language) => void
  t: Translations
}

const LangContext = createContext<LangContextValue>({
  lang: 'tr',
  setLang: () => {},
  t: getTranslations('tr'),
})

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>('tr')

  useEffect(() => {
    void AsyncStorage.getItem(LANG_STORAGE_KEY).then((stored) => {
      if (stored === 'en' || stored === 'tr') setLangState(stored)
    })
  }, [])

  function setLang(l: Language) {
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
