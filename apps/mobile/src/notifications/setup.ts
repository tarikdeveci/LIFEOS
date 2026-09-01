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
 * Cihazın saat dilimini notification_preferences'a yazar.
 *
 * Bildirim saatleri sunucuda bu kolona göre hesaplanıyor. Kayıt anında alınan
 * timezone yetmiyor: kullanıcı taşınabilir, seyahat edebilir, ya da kaydı bu
 * alan hiç doldurulmadan önce açılmış olabilir. Her token kaydında tazeliyoruz.
 */
export async function syncTimezone(userId: string): Promise<void> {
  let tz: string
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return
  }
  if (!tz) return

  const { data } = await supabase
    .from('notification_preferences')
    .select('timezone')
    .eq('user_id', userId)
    .maybeSingle()

  // Gereksiz yazma yapma — sadece gerçekten değiştiyse güncelle
  if (data?.timezone === tz) return

  await supabase
    .from('notification_preferences')
    .update({ timezone: tz })
    .eq('user_id', userId)
}

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

  // Token'ı push_tokens tablosuna upsert et
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const platform = Platform.OS as 'ios' | 'android'

    // onConflict boşluksuz olmalı: PostgREST bunu kolon listesi olarak ayrıştırır,
    // "user_id, platform" ikinci kolonu " platform" diye okur. Hata da hiç
    // kontrol edilmiyordu, yani kayıt sessizce düşebiliyordu.
    const { error } = await supabase.from('push_tokens').upsert(
      { user_id: user.id, token, platform },
      { onConflict: 'user_id,platform' },
    )
    if (error) console.warn('Push token kaydedilemedi:', error.message)

    // Aynı kullanıcının eski token satırları kalırsa her biri ayrı bir teslim
    // olur ve tek bildirim birden çok kez düşer. Yeniden kurulum, yeni build ve
    // dev/TestFlight kopyaları bu satırları üretir.
    //
    // Aynı token'ı BAŞKA bir kullanıcı tutuyorsa burada temizlenemez: RLS
    // başkasının satırını sildirmez. Onu 037'deki push_tokens_claim trigger'ı
    // sunucu tarafında devralır.
    const { error: cleanupError } = await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', user.id)
      .eq('platform', platform)
      .neq('token', token)
    if (cleanupError) console.warn('Eski push token silinemedi:', cleanupError.message)

    await syncTimezone(user.id)
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
 * Çıkış yapmadan ÖNCE çağrılır: bu cihazın token satırını kullanıcıdan koparır.
 *
 * Silinmezse hesap cihazda kalmaya devam eder. Aynı cihaza başka bir hesapla
 * girildiğinde token iki kullanıcıya birden bağlı olur; her ikisinin bildirimi
 * de aynı cihaza düşer — hem bildirim tekrarlanır hem de cihaz, o an giriş
 * yapmamış hesabın görev ve beslenme özetini gösterir.
 *
 * (user_id, platform) benzersiz olduğu için tek satır siler; token'ı ayrıca
 * okumaya gerek yok.
 */
export async function unregisterPushTokenAsync(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { error } = await supabase
    .from('push_tokens')
    .delete()
    .eq('user_id', user.id)
    .eq('platform', Platform.OS as 'ios' | 'android')

  // Çıkışı bloklamaz: token silinemese bile kullanıcı oturumu kapatabilmeli.
  if (error) console.warn('Push token silinemedi:', error.message)
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
