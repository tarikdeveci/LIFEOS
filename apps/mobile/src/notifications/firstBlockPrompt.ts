import AsyncStorage from '@react-native-async-storage/async-storage'
import { registerForPushNotificationsAsync } from './setup'

const PROMPTED_KEY = 'lifeos_push_prompted_after_block'

/**
 * Kullanıcı ilk zaman bloğunu kaydettiğinde bildirim izni bir kez istenir: bildirimin
 * değeri o an belli (blok hatırlatması). Misafir ilk açılışta ve onboarding sonunda izin sorulmaz.
 * Okuma ya da yazma başarısız olursa sormaktan vazgeçilir, kullanıcı hiçbir şeyle karşılaşmaz.
 */
export async function promptPushAfterFirstBlock(): Promise<void> {
  try {
    if ((await AsyncStorage.getItem(PROMPTED_KEY)) === '1') return
    await AsyncStorage.setItem(PROMPTED_KEY, '1')
  } catch {
    return
  }
  await registerForPushNotificationsAsync({ prompt: true })
}
