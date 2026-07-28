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

export interface FetchEventsResult {
  events: Calendar.Event[]
  /** Sorgulanamayan takvim kimlikleri — bayatlamış olabilirler */
  failedCalendarIds: string[]
}

/**
 * Etkinlikleri takvim takvim çeker.
 *
 * Eskiden hepsi tek `getEventsAsync(calendarIds, ...)` çağrısındaydı ve hata
 * sessizce yutuluyordu. iOS'ta listedeki TEK bir geçersiz kimlik bile çağrının
 * tamamını fırlatıyor (Android tolere ediyor); kimlikler AsyncStorage'da kalıcı
 * saklandığı için takvim silindiğinde/değiştiğinde bayatlıyor ve senkron hiç
 * çalışmıyormuş gibi görünüyordu — üstelik hiçbir hata gösterilmeden.
 *
 * Artık her takvim ayrı sorgulanıyor: bozuk olan diğerlerini düşürmüyor,
 * hangilerinin başarısız olduğu da çağırana bildiriliyor.
 */
export async function fetchLocalEvents(
  calendarIds: string[],
  startDate: Date,
  endDate: Date,
): Promise<FetchEventsResult> {
  if (calendarIds.length === 0) return { events: [], failedCalendarIds: [] }

  const settled = await Promise.all(
    calendarIds.map(async (id) => {
      try {
        return { id, events: await Calendar.getEventsAsync([id], startDate, endDate) }
      } catch (error) {
        console.warn('Takvim okunamadı:', id, error)
        return { id, events: null }
      }
    }),
  )

  return {
    events: settled.flatMap((r) => r.events ?? []),
    failedCalendarIds: settled.filter((r) => r.events === null).map((r) => r.id),
  }
}

export interface LocalCalendarEvent {
  id: string
  title: string
  startsAt: string
  endsAt: string
  /**
   * Etkinliğin YEREL takvim günü (YYYY-MM-DD).
   *
   * `startsAt` UTC ISO'dur; gün filtresini onun ilk 10 karakterine göre yapmak
   * UTC+3'te 00:00–02:59 arası etkinlikleri bir önceki güne düşürüyordu.
   * Gün eşleştirmesi daima bu alan üzerinden yapılmalı.
   */
  localDate: string
  isAllDay: boolean
  location: string | null
  notes: string | null
  calendarId: string
  source: 'local_calendar'
}

function toLocalDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function mapToLifeOSEvent(event: Calendar.Event): LocalCalendarEvent {
  const startDate = event.startDate
  const endDate = event.endDate

  const start = typeof startDate === 'string' ? new Date(startDate) : (startDate as Date)
  const startsAt = start.toISOString()
  const endsAt =
    typeof endDate === 'string' ? endDate : (endDate as Date).toISOString()

  const isAllDay = event.allDay ?? false
  // Tüm gün etkinlikleri UTC gece yarısında saklanır; yerele çevirmek onları
  // kaydırır. Onlarda ISO'nun gün kısmı zaten doğru gündür.
  const localDate = isAllDay ? startsAt.slice(0, 10) : toLocalDateString(start)

  return {
    id: `local_${event.id}`,
    title: (event.title ?? '(Başlıksız)').trim() || '(Başlıksız)',
    startsAt,
    endsAt,
    localDate,
    isAllDay,
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
