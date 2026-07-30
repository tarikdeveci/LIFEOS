// Özel giriş noktası: expo-router'ı başlatır ve Android widget task handler'ını
// kaydeder. Android widget'ları uygulama kapalıyken de render edilebildiği için
// handler root component'ten bağımsız olarak kayıtlı olmalı.
import { Platform } from 'react-native'
import 'expo-router/entry'

if (Platform.OS === 'android') {
  const { registerWidgetTaskHandler } = require('react-native-android-widget')
  const { widgetTaskHandler } = require('./src/widgets/widget-task-handler')
  registerWidgetTaskHandler(widgetTaskHandler)
}
