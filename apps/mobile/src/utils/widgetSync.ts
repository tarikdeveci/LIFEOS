import { Platform } from 'react-native'

export interface WidgetTask {
  id: string
  title: string
  priority: number
  done: boolean
}

export interface WidgetEvent {
  title: string
  startsAt: string
}

export interface WidgetCalorieProgress {
  consumed: number
  target: number
}

export interface WidgetData {
  updatedAt: string
  todayTasks: WidgetTask[]
  nextEvent: WidgetEvent | null
  calorieProgress: WidgetCalorieProgress | null
}

export async function syncWidgetData(data: WidgetData): Promise<void> {
  const json = JSON.stringify(data)

  if (Platform.OS === 'ios') {
    try {
      // App Groups shared container: group.com.lifeos.widget
      // expo prebuild + @react-native-community/shared-preferences gerektirir
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = await import('@react-native-community/shared-preferences').catch(() => null)
      if (mod) {
        await (mod as unknown as { default: { setItem: (k: string, v: string, g: string) => Promise<void> } }).default.setItem('widgetData', json, 'group.com.lifeos.widget')
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const wk = await import('react-native-widgetkit').catch(() => null)
      if (wk) {
        ;(wk as unknown as { reloadAllTimelines: () => void }).reloadAllTimelines()
      }
    } catch {
      // Widget native modülleri yoksa sessizce geç
    }
  }

  if (Platform.OS === 'android') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = await import('react-native-shared-preferences').catch(() => null)
      if (mod) {
        ;(mod as unknown as { default: { setItem: (k: string, v: string) => void } }).default.setItem('widgetData', json)
      }
    } catch {
      // Widget native modülleri yoksa sessizce geç
    }
  }
}
