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
   * Gün eşleştirmesi daima bu alan üzerinden yapılmalı — nasıl hesaplandığı
   * için `mapToLifeOSEvent` içindeki tüm gün notuna bak.
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
  // Tüm gün etkinliğinin gününü platform belirler; ikisini aynı şekilde okumak
  // günü kaydırıyor:
  //   iOS   — EKEvent, tüm gün etkinliğini YEREL gece yarısında tutar. UTC+3'te
  //           30 Ağustos etkinliği 29 Ağustos 21:00Z olur; ISO'nun gün kısmını
  //           almak etkinliği bir gün geriye çekiyordu (kullanıcı bugünün
  //           listesinde yarının etkinliklerini görüyordu).
  //   Android — takvim sağlayıcısı tüm gün etkinliklerini UTC gece yarısında
  //           tutar; yerele çevirmek negatif ofsetli saat dilimlerinde günü
  //           geriye kaydırır. Orada ISO'nun gün kısmı doğrudur.
  // Saatli etkinliklerde iki platform da aynı: yerel gün doğru gündür.
  const localDate = isAllDay && Platform.OS === 'android'
    ? startsAt.slice(0, 10)
    : toLocalDateString(start)

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

// ============================
// Takvime YAZMA
// ============================
// Bu dosyanın geri kalanı takvimi okuyor; aşağısı tersi yönde çalışıyor:
// antrenman programını cihazın takvimine yazıyor.

/**
 * Yazılabilir bir takvim bulur.
 *
 * `getDefaultCalendarAsync()` tek başına yetmiyor: iOS'ta varsayılan takvim
 * abonelik takvimi (tatiller, maç fikstürü) olabiliyor ve bunlara etkinlik
 * yazılamıyor — `createEventAsync` orada sessizce değil, fırlatarak patlıyor.
 * Bu yüzden önce `allowsModifications` süzgecinden geçiriyoruz.
 */
export async function findWritableCalendarId(): Promise<string | null> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)
  const writable = calendars.filter((c) => c.allowsModifications)
  if (writable.length === 0) return null

  if (Platform.OS === 'ios') {
    try {
      const fallback = await Calendar.getDefaultCalendarAsync()
      if (fallback && writable.some((c) => c.id === fallback.id)) return fallback.id
    } catch {
      // Varsayılan alınamadı — aşağıdaki seçim yine de çalışır.
    }
  }

  const primary = writable.find((c) => (c as { isPrimary?: boolean }).isPrimary)
  return (primary ?? writable[0])?.id ?? null
}

export interface RecurringEventInput {
  title: string
  notes: string
  startsAt: Date
  durationMinutes: number
  /** Kaç hafta tekrar edecek. 1 ise tekrar kuralı hiç yazılmaz. */
  weeklyOccurrences: number
  /** Etkinlikten kaç dakika önce hatırlatsın; null ise alarm kurulmaz. */
  reminderMinutesBefore: number | null
}

/**
 * Haftalık tekrar eden tek bir etkinlik yazar ve kimliğini döndürür.
 *
 * 8 hafta için 8 ayrı etkinlik değil, tekrar kuralı olan TEK etkinlik
 * yazılıyor: kullanıcı programı bıraktığında takvimden tek dokunuşla
 * silebilsin. Tek tek yazılsaydı sekiz kalıntı bırakırdık.
 */
export async function createRecurringEvent(
  calendarId: string,
  input: RecurringEventInput,
): Promise<string> {
  const endDate = new Date(input.startsAt.getTime() + input.durationMinutes * 60_000)

  return Calendar.createEventAsync(calendarId, {
    title: input.title,
    notes: input.notes,
    startDate: input.startsAt,
    endDate,
    ...(input.reminderMinutesBefore !== null
      ? { alarms: [{ relativeOffset: -input.reminderMinutesBefore }] }
      : {}),
    ...(input.weeklyOccurrences > 1
      ? {
          recurrenceRule: {
            frequency: Calendar.Frequency.WEEKLY,
            interval: 1,
            occurrence: input.weeklyOccurrences,
          },
        }
      : {}),
  })
}

// Android'de Calendar API'si iOS'tan farklı davranır — bu helper fark'ı normalize eder
export function isCalendarSupported(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android'
}
