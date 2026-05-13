'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { getTranslations, type Language, type Translations, LANG_STORAGE_KEY } from '@/lib/i18n'

interface LangContextValue {
  lang: Language
  setLang: (l: Language) => void
  t: Translations
}

const LangContext = createContext<LangContextValue>({
  lang: 'en',
  setLang: () => {},
  t: getTranslations('en'),
})

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>('en')

  useEffect(() => {
    const stored = localStorage.getItem(LANG_STORAGE_KEY) as Language | null
    if (stored === 'en' || stored === 'tr') setLangState(stored)
  }, [])

  function setLang(l: Language) {
    setLangState(l)
    localStorage.setItem(LANG_STORAGE_KEY, l)
  }

  return (
    <LangContext.Provider value={{ lang, setLang, t: getTranslations(lang) }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() {
  return useContext(LangContext)
}
