import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Tanıtım turu bir kez gösterilir. Anahtar kullanıcı kimliğine bağlı: aynı
 * cihazda başka bir hesapla giriş yapan kişi turu kendi hesabı için görür,
 * ilk kullanıcının durumu onun hesabına yazılı kalır.
 */
const KEY_PREFIX = 'lifeos_onboarding_seen:'

export async function hasSeenOnboarding(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY_PREFIX + userId)) === '1'
  } catch {
    // Depolama okunamıyorsa turu tekrar göstermek, akışı kilitlemekten iyidir.
    return false
  }
}

export async function markOnboardingSeen(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_PREFIX + userId, '1')
  } catch {
    // Yazılamazsa tur bir sonraki açılışta tekrar çıkar; veri kaybı yok.
  }
}

/** Gerçek ekran üstündeki ipucu turu (coach mark) da hesap başına bir kez gösterilir. */
const COACH_PREFIX = 'lifeos_coach_seen:'

export async function hasSeenCoach(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(COACH_PREFIX + userId)) === '1'
  } catch {
    // Okunamıyorsa göstermeyiz: ipucu turu tanıtımın aksine zorunlu değil.
    return true
  }
}

export async function markCoachSeen(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(COACH_PREFIX + userId, '1')
  } catch {
    // Yazılamazsa tur bir kez daha çıkabilir; zararsız.
  }
}
