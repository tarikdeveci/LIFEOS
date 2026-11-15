import { useEffect, useRef } from 'react'
import { AppState, type AppStateStatus } from 'react-native'

/** Uygulama arka plandan öne gelince çalışır (ör. sistem ayarlarından dönüş). */
export function useOnAppActive(callback: () => void): void {
  const latest = useRef(callback)
  latest.current = callback
  const appState = useRef(AppState.currentState)

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (/inactive|background/.test(appState.current) && next === 'active') latest.current()
      appState.current = next
    })
    return () => subscription.remove()
  }, [])
}
