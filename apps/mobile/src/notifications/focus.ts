import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

/** Uses the existing permission setup; never requests permission here. */
export async function scheduleFocusNotification(
  identifier: string, deadline: number, phase: 'work' | 'break',
): Promise<boolean> {
  const permission = await Notifications.getPermissionsAsync()
  const allowed = permission.granted
    || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  if (!allowed || deadline <= Date.now()) return false
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('focus-timer', {
      name: 'Odak zamanlayıcısı', importance: Notifications.AndroidImportance.HIGH,
    })
  }
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: phase === 'work' ? 'Odak süren tamamlandı' : 'Molan tamamlandı',
      body: phase === 'work' ? 'Şimdi kısa bir mola ver.' : 'Yeni odak turuna hazır mısın?',
      sound: 'default',
      data: { type: 'focus_timer' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(deadline),
      channelId: 'focus-timer',
    },
  })
  return true
}

export const FOCUS_WORK_END_ID = 'focus-work-end'
export const FOCUS_BREAK_END_ID = 'focus-break-end'

/** Odak ve mola bitiş bildirimlerini birlikte iptal eder; hata yutulur. */
export async function cancelFocusNotifications(): Promise<void> {
  await Promise.all([FOCUS_WORK_END_ID, FOCUS_BREAK_END_ID].map((id) =>
    Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined),
  ))
}
