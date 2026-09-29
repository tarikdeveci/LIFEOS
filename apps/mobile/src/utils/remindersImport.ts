import * as Calendar from 'expo-calendar'
import { reminderToExternal, type ExternalTaskInput } from '@lifeos/shared'

/**
 * iOS Hatırlatıcılar'daki açık hatırlatıcıları okur. İzin verilmezse 'denied'.
 * Durum filtresi verilince tarih aralığı zorunlu oluyor; filtresiz okuyup
 * tamamlananları reminderToExternal eliyor.
 */
export async function readOpenReminders(): Promise<ExternalTaskInput[] | 'denied'> {
  const { status } = await Calendar.requestRemindersPermissionsAsync()
  if (status !== 'granted') return 'denied'
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.REMINDER)
  if (calendars.length === 0) return []
  const reminders = await Calendar.getRemindersAsync(calendars.map((c) => c.id), null, null, null)
  return reminders.map(reminderToExternal).filter((r): r is ExternalTaskInput => r !== null)
}
