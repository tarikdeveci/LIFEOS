/**
 * Widget snapshot'ının platforma yazılması ve okunması.
 *
 * iOS: App Group UserDefaults (ExtensionStorage) → SwiftUI widget okur.
 * Android: AsyncStorage → widget task handler JS içinde okur.
 *
 * Not: Eski implementasyon `@react-native-community/shared-preferences`
 * kullanıyordu ama App Group köprüsü hiçbir zaman çalışmadı. Artık
 * `@bacons/apple-targets`'ın ExtensionStorage'ı kullanılıyor.
 */

import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { WidgetSnapshot } from '@lifeos/shared'

export const WIDGET_STORAGE_KEY = 'lifeos_widget_snapshot'
export const IOS_APP_GROUP = 'group.tr.lifeos.app.widget'

type ExtensionStorageModule = typeof import('@bacons/apple-targets')

async function loadExtensionStorage(): Promise<ExtensionStorageModule | null> {
  try {
    return await import('@bacons/apple-targets')
  } catch {
    return null
  }
}

/** Snapshot'ı platform deposuna yazar ve widget'ı yeniden çizmeye zorlar */
export async function persistWidgetSnapshot(snapshot: WidgetSnapshot): Promise<void> {
  const json = JSON.stringify(snapshot)

  // Android widget task handler AsyncStorage'dan okur; her platformda tut ki
  // task handler debug ederken de erişilebilsin.
  await AsyncStorage.setItem(WIDGET_STORAGE_KEY, json).catch(() => {})

  if (Platform.OS === 'ios') {
    const mod = await loadExtensionStorage()
    if (!mod) return
    try {
      const storage = new mod.ExtensionStorage(IOS_APP_GROUP)
      storage.set(WIDGET_STORAGE_KEY, json)
      mod.ExtensionStorage.reloadWidget()
    } catch {
      // Native taraf yoksa (Expo Go) sessizce geç
    }
  }

  if (Platform.OS === 'android') {
    try {
      const { requestWidgetUpdate } = await import('react-native-android-widget')
      const { renderLifeOSWidget } = await import('./render')
      await requestWidgetUpdate({
        widgetName: 'LifeOS',
        renderWidget: () => renderLifeOSWidget(snapshot),
        widgetNotFound: () => {},
      })
    } catch {
      // Widget eklenmemişse veya native yoksa geç
    }
  }
}

/** Task handler için depodan snapshot okur (Android). Yoksa null. */
export async function readWidgetSnapshot(): Promise<WidgetSnapshot | null> {
  try {
    const json = await AsyncStorage.getItem(WIDGET_STORAGE_KEY)
    return json ? (JSON.parse(json) as WidgetSnapshot) : null
  } catch {
    return null
  }
}
