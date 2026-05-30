import * as Calendar from 'expo-calendar'
import { Platform } from 'react-native'

export async function requestCalendarPermission(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync()
  return status === 'granted'
}

export async function getAvailableCalendars(): Promise<Calendar.Calendar[]> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)
  return calendars
}

export async function fetchLocalEvents(
  calendarIds: string[],
  startDate: Date,
  endDate: Date,
): Promise<Calendar.Event[]> {
  if (calendarIds.length === 0) return []
  try {
    return await Calendar.getEventsAsync(calendarIds, startDate, endDate)
  } catch {
    return []
  }
}

export interface LocalCalendarEvent {
  id: string
  title: string
  startsAt: string
  endsAt: string
  isAllDay: boolean
  location: string | null
  notes: string | null
  calendarId: string
  source: 'local_calendar'
}

export function mapToLifeOSEvent(event: Calendar.Event): LocalCalendarEvent {
  const startDate = event.startDate
  const endDate = event.endDate

  const startsAt =
    typeof startDate === 'string' ? startDate : (startDate as Date).toISOString()
  const endsAt =
    typeof endDate === 'string' ? endDate : (endDate as Date).toISOString()

  return {
    id: `local_${event.id}`,
    title: (event.title ?? '(Başlıksız)').trim() || '(Başlıksız)',
    startsAt,
    endsAt,
    isAllDay: event.allDay ?? false,
    location: event.location ?? null,
    notes: event.notes ?? null,
    calendarId: event.calendarId,
    source: 'local_calendar',
  }
}

// Android'de Calendar API'si iOS'tan farklı davranır — bu helper fark'ı normalize eder
export function isCalendarSupported(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android'
}
