import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from '../lib/supabase'

// Foreground notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

/**
 * Push notification izni iste ve token'ı Supabase'e kaydet
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn('Push notifications sadece fiziksel cihazda çalışır')
    return null
  }

  // Expo Go SDK 53+ remote push notifications'ı desteklemiyor — development build gerekli
  const isExpoGo = Constants.appOwnership === 'expo'
  if (isExpoGo) {
    console.warn('Push notifications Expo Go ile çalışmaz. Development build kullanın.')
    return null
  }

  // İzin kontrol
  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    console.warn('Push notification izni alınamadı')
    return null
  }

  // Token al
  let token: string
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync()
    token = tokenData.data
  } catch (err) {
    console.warn('Push token alınamadı:', err)
    return null
  }

  // Token'ı Supabase'e kaydet — sadece değişmişse güncelle
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('preferences')
      .eq('id', user.id)
      .single()

    if (profile) {
      const preferences = (profile.preferences as Record<string, unknown>) ?? {}
      if (preferences['push_token'] !== token) {
        await supabase
          .from('user_profiles')
          .update({
            preferences: { ...preferences, push_token: token },
          })
          .eq('id', user.id)
      }
    }
  }

  // Android kanal ayarla
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Varsayılan',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    })

    await Notifications.setNotificationChannelAsync('task-reminders', {
      name: 'Görev Hatırlatmaları',
      importance: Notifications.AndroidImportance.HIGH,
    })

    await Notifications.setNotificationChannelAsync('nutrition', {
      name: 'Beslenme Bildirimleri',
      importance: Notifications.AndroidImportance.DEFAULT,
    })
  }

  return token
}

/**
 * Notification tıklama listener'ı
 * Expo Router ile ilgili sayfaya navigate eder
 */
export function addNotificationResponseListener(
  navigate: (path: string) => void,
) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, string>

    if (data['type'] === 'task_reminder' && data['task_id']) {
      navigate(`/task/${data['task_id']}`)
    } else if (data['type'] === 'morning_briefing') {
      navigate('/(tabs)/today')
    } else if (data['type'] === 'evening_nutrition') {
      navigate('/(tabs)/nutrition')
    }
  })
}
