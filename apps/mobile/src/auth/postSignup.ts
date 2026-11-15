import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'
import { getAiAllowance } from '@lifeos/shared/supabase'
import { supabase } from '@/src/lib/supabase'
import { afterAiResult, afterConfirmation, postSignupKey } from './postSignupRules'

/** Paywall'ı bir kez aç, ilk ücretsiz AI sonucu okunabilsin diye kısa bir gecikmeyle. */
const AI_RESULT_DELAY_MS = 1500

function openPaywall(params: Record<string, string>): void {
  router.push({ pathname: '/paywall', params: { source: 'post_signup', ...params } })
}

/** Hesap yükseltme onayı bittiğinde: paywall'ı hemen aç ya da ilk AI sonucuna beklet. */
export async function runPostSignupAfterConfirmation(userId: string, reason: string | undefined): Promise<void> {
  const key = postSignupKey(userId)
  try {
    if ((await AsyncStorage.getItem(key)) === 'shown') return
    const step = afterConfirmation(reason)
    await AsyncStorage.setItem(key, step.write)
    if (step.openNow) openPaywall({})
  } catch {
    // Depolama bozuksa paywall açılmaz; kullanıcıyı engellemekten iyi.
  }
}

/** Başarılı her AI yanıtından sonra çağrılır; bekleyen post_signup paywall'ı varsa kalan hakla açar. */
export async function runPostSignupAfterAiResult(): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession()
    const userId = data.session?.user.id
    if (!userId) return
    const key = postSignupKey(userId)
    const step = afterAiResult(await AsyncStorage.getItem(key))
    if (!step.open || !step.write) return
    await AsyncStorage.setItem(key, step.write)
    const freeLeft = await getAiAllowance(supabase).then((a) => a.freePlansLeft).catch(() => null)
    setTimeout(
      () => openPaywall(freeLeft === null ? {} : { freeLeft: String(freeLeft) }),
      AI_RESULT_DELAY_MS,
    )
  } catch {
    // Ölçüm ve teklif yan iştir, AI sonucunu bozmaz.
  }
}
