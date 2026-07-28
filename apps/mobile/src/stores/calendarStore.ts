import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  requestCalendarPermission,
  getAvailableCalendars,
  fetchLocalEvents,
  mapToLifeOSEvent,
  isCalendarSupported,
  type LocalCalendarEvent,
} from '../utils/calendarSync'
import type { Calendar } from 'expo-calendar'

interface CalendarStore {
  hasPermission: boolean
  selectedCalendarIds: string[]
  availableCalendars: Calendar[]
  localEvents: LocalCalendarEvent[]
  isSyncing: boolean
  lastSyncedAt: string | null
  /** Son senkronda okunamayan takvim varsa kısa açıklama, yoksa null */
  lastSyncError: string | null

  initialize: () => Promise<void>
  syncEvents: (daysAhead?: number) => Promise<void>
  toggleCalendar: (id: string) => Promise<void>
}

export const useCalendarStore = create<CalendarStore>()(
  persist(
    (set, get) => ({
      hasPermission: false,
      selectedCalendarIds: [],
      availableCalendars: [],
      localEvents: [],
      isSyncing: false,
      lastSyncedAt: null,
      lastSyncError: null,

      initialize: async () => {
        if (!isCalendarSupported()) return

        const granted = await requestCalendarPermission()
        if (!granted) {
          set({ hasPermission: false })
          return
        }

        set({ hasPermission: true })
        const calendars = await getAvailableCalendars()
        set({ availableCalendars: calendars })

        // Seçili kimlikler kalıcı saklanıyor ama takvimler silinip değişebiliyor.
        // Bayat kimlikleri at; geriye hiçbiri kalmazsa hepsini yeniden seç,
        // yoksa senkron sessizce boş dönmeye devam eder.
        const available = new Set(calendars.map((c) => c.id))
        const stillValid = get().selectedCalendarIds.filter((id) => available.has(id))
        set({ selectedCalendarIds: stillValid.length > 0 ? stillValid : calendars.map((c) => c.id) })

        await get().syncEvents()
      },

      syncEvents: async (daysAhead = 7) => {
        const { selectedCalendarIds, hasPermission } = get()
        if (!hasPermission || selectedCalendarIds.length === 0) return

        set({ isSyncing: true, lastSyncError: null })

        const start = new Date()
        start.setHours(0, 0, 0, 0)

        const end = new Date(start)
        end.setDate(end.getDate() + daysAhead)
        end.setHours(23, 59, 59, 999)

        const { events, failedCalendarIds } = await fetchLocalEvents(selectedCalendarIds, start, end)

        // Okunamayan takvimleri seçimden düş ki bir dahakine tekrar denenmesin
        if (failedCalendarIds.length > 0) {
          const failed = new Set(failedCalendarIds)
          set({ selectedCalendarIds: get().selectedCalendarIds.filter((id) => !failed.has(id)) })
        }

        set({
          localEvents: events.map(mapToLifeOSEvent),
          isSyncing: false,
          lastSyncedAt: new Date().toISOString(),
          lastSyncError: failedCalendarIds.length > 0
            ? `${failedCalendarIds.length} takvim okunamadı`
            : null,
        })
      },

      toggleCalendar: async (id: string) => {
        const { selectedCalendarIds } = get()
        const updated = selectedCalendarIds.includes(id)
          ? selectedCalendarIds.filter((c) => c !== id)
          : [...selectedCalendarIds, id]

        set({ selectedCalendarIds: updated })
        await get().syncEvents()
      },
    }),
    {
      name: 'calendar-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        selectedCalendarIds: state.selectedCalendarIds,
        hasPermission: state.hasPermission,
      }),
    },
  ),
)
