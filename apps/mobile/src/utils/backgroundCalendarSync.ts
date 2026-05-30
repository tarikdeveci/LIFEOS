import * as BackgroundFetch from 'expo-background-fetch'
import * as TaskManager from 'expo-task-manager'
import { useCalendarStore } from '../stores/calendarStore'

export const CALENDAR_SYNC_TASK = 'lifeos-calendar-sync'

// Uygulama başında bir kez tanımlanmalı (module scope)
TaskManager.defineTask(CALENDAR_SYNC_TASK, async () => {
  try {
    await useCalendarStore.getState().syncEvents()
    return BackgroundFetch.BackgroundFetchResult.NewData
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed
  }
})

export async function registerCalendarBackgroundSync(): Promise<void> {
  const status = await BackgroundFetch.getStatusAsync()
  if (
    status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
    status === BackgroundFetch.BackgroundFetchStatus.Denied
  ) {
    return
  }

  const isRegistered = await TaskManager.isTaskRegisteredAsync(CALENDAR_SYNC_TASK)
  if (isRegistered) return

  await BackgroundFetch.registerTaskAsync(CALENDAR_SYNC_TASK, {
    minimumInterval: 15 * 60, // 15 dakika (sistem optimizasyonuna bağlı)
    stopOnTerminate: false,
    startOnBoot: true,
  })
}
