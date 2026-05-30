import { useEffect, useRef } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { useCalendarStore } from '../stores/calendarStore'

// App her foreground'a geldiğinde calendar sync tetikler
export function useCalendarAutoSync(): void {
  const syncEvents = useCalendarStore((s) => s.syncEvents)
  const appState = useRef(AppState.currentState)

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        void syncEvents()
      }
      appState.current = nextState
    })

    return () => subscription.remove()
  }, [syncEvents])
}
