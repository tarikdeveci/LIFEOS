import AsyncStorage from '@react-native-async-storage/async-storage'
import { registerForPushNotificationsAsync } from './setup'

// Anahtar eski adıyla kalır: ilk blokta zaten sorulmuş kullanıcıya ikinci kez sorulmaz.
const PROMPTED_KEY = 'lifeos_push_prompted_after_block'

/**
 * Bildirim izni kullanıcının ilk anlamlı kaydında bir kez istenir: ilk görev, ilk öğün,
 * ilk zaman bloğu veya ilk bitirilen antrenman. Misafir dahil herkes için geçerlidir;
 * misafirin izin penceresini gördüğü tek yer burası (ilk açılışta sorulmaz).
 * Canlı veri: kullanıcıların çoğu ilk blok oluşturmadığı için izin hiç sorulmuyordu,
 * ertesi gün geri çağıracak kanal yoktu (2026-11-26).
 * Okuma ya da yazma başarısız olursa sormaktan vazgeçilir, kullanıcı hiçbir şeyle karşılaşmaz.
 */
export async function promptPushAfterFirstAction(): Promise<void> {
  try {
    if ((await AsyncStorage.getItem(PROMPTED_KEY)) === '1') return
    await AsyncStorage.setItem(PROMPTED_KEY, '1')
  } catch {
    return
  }
  await registerForPushNotificationsAsync({ prompt: true })
}
