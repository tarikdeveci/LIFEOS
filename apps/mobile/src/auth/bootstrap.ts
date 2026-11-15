import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '@/src/lib/supabase'

/** Cihazda daha önce herhangi bir oturum (misafir dahil) açıldıysa yazılır; çıkış yapmış kullanıcıya otomatik misafir açılmaz. */
export const HAD_SESSION_KEY = 'lifeos_had_session'

export async function markHadSession(): Promise<void> {
  try {
    await AsyncStorage.setItem(HAD_SESSION_KEY, '1')
  } catch {
    // Yazılamazsa ilk açılış kararı bir sonraki oturumda tekrar denenir.
  }
}

export async function hadSession(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(HAD_SESSION_KEY)) === '1'
  } catch {
    // Okunamazsa güvenli taraf: kullanıcıyı girişe götür, kimsenin oturumunu ezme.
    return true
  }
}

/** Anonim oturum açar; saat dilimi kayıt anında profile yazılsın diye metadata ile gider. */
export async function bootstrapGuest(): Promise<boolean> {
  let timezone: string | undefined
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    timezone = undefined
  }
  const { error } = await supabase.auth.signInAnonymously({ options: { data: timezone ? { timezone } : {} } })
  return !error
}
