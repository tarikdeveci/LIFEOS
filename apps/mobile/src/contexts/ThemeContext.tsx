import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { Appearance } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const THEME_KEY = 'lifeos_theme'

// Light theme colors
const lightTheme = {
  bg: '#D9DFF2',
  card: { bg: '#FFFFFF', border: 'rgba(99, 102, 241, 0.08)' },
  input: { bg: '#F8F9FF', border: 'rgba(99, 102, 241, 0.18)', text: '#0D1B3E', placeholder: '#97A3C9' },
  text: { primary: '#0D1B3E', secondary: '#2E3E6B', muted: '#63709A', accent: '#6366F1' },
  accent: '#6366F1',
  separator: 'rgba(99, 102, 241, 0.10)',
  tabBar: { bg: '#EEF0FA', active: '#6366F1', inactive: '#97A3C9' },
}

// Dark theme colors
const darkTheme = {
  bg: '#0B1120',
  card: { bg: '#141D30', border: 'rgba(99, 102, 241, 0.18)' },
  input: { bg: '#1A2540', border: 'rgba(99, 102, 241, 0.25)', text: '#E2E8F0', placeholder: '#64748B' },
  text: { primary: '#E2E8F0', secondary: '#94A3B8', muted: '#64748B', accent: '#818CF8' },
  accent: '#818CF8',
  separator: 'rgba(99, 102, 241, 0.15)',
  tabBar: { bg: '#0D1525', active: '#818CF8', inactive: '#475569' },
}

export type AppTheme = typeof lightTheme

interface ThemeContextValue {
  mode: ThemeMode
  resolved: ResolvedTheme
  theme: AppTheme
  setMode: (m: ThemeMode) => void
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  resolved: 'light',
  theme: lightTheme,
  setMode: () => {},
  isDark: false,
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system')
  const systemScheme = Appearance.getColorScheme() ?? 'light'

  useEffect(() => {
    void AsyncStorage.getItem(THEME_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setModeState(stored)
      }
    })
  }, [])

  function setMode(m: ThemeMode) {
    setModeState(m)
    void AsyncStorage.setItem(THEME_KEY, m)
  }

  const resolved: ResolvedTheme = mode === 'system' ? (systemScheme as ResolvedTheme) : mode
  const theme = resolved === 'dark' ? darkTheme : lightTheme

  return (
    <ThemeContext.Provider value={{ mode, resolved, theme, setMode, isDark: resolved === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
