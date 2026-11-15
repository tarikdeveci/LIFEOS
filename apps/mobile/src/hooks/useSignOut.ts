import { Alert } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '@/src/lib/supabase'
import { unregisterPushTokenAsync } from '@/src/notifications/setup'
import { useAuth } from '@/src/contexts/AuthContext'
import { useLang } from '@/src/contexts/LangContext'

/**
 * Profildeki çıkış eylemi. Misafir çıkarsa verisi geri gelmez: hesap kaydetmek ilk seçenek olarak sunulur.
 */
export function useSignOut(): () => void {
  const { t } = useLang()
  const { isAnonymous } = useAuth()

  async function signOutNow() {
    // Token oturum kapanmadan silinmeli: silme RLS altında çalışıyor,
    // signOut'tan sonra kimlik kalmaz ve satır cihazda asılı kalır.
    await unregisterPushTokenAsync()
    await supabase.auth.signOut()
  }

  return function handleSignOut() {
    if (isAnonymous) {
      Alert.alert(t.guest_signout_title, t.guest_signout_body, [
        { text: t.acc_cancel, style: 'cancel' },
        { text: t.gate_create, onPress: () => router.push('/(auth)/register' as never) },
        { text: t.guest_signout_confirm, style: 'destructive', onPress: () => void signOutNow() },
      ])
      return
    }
    Alert.alert(t.acc_logout_title, t.acc_logout_confirm, [
      { text: t.acc_cancel, style: 'cancel' },
      { text: t.acc_logout_btn, style: 'destructive', onPress: () => void signOutNow() },
    ])
  }
}
