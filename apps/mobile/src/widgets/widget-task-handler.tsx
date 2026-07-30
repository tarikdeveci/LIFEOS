/**
 * Android widget task handler — headless JS bağlamında çalışır.
 *
 * Sistem widget'ı eklediğinde/güncellediğinde/tıklandığında çağrılır. Uygulama
 * çalışmıyor olabileceği için veriyi depodan (AsyncStorage) okur; canlı store'a
 * erişemez.
 */

import type { WidgetTaskHandlerProps } from 'react-native-android-widget'
import { emptyWidgetSnapshot } from '@lifeos/shared'
import { readWidgetSnapshot } from './storage'
import { renderLifeOSWidget } from './render'

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const { widgetAction, renderWidget } = props

  if (widgetAction === 'WIDGET_DELETED') return

  // WIDGET_ADDED / WIDGET_UPDATE / WIDGET_RESIZED / WIDGET_CLICK
  const snapshot = (await readWidgetSnapshot()) ?? emptyWidgetSnapshot()
  renderWidget(renderLifeOSWidget(snapshot))
}
