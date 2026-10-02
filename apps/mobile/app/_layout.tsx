import { useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as Linking from 'expo-linking'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Session } from '@supabase/supabase-js'
import * as WebBrowser from 'expo-web-browser'
import { emptyWidgetSnapshot, persistFocus, useFocusStore, useGoalStore } from '@lifeos/shared'
import { configureEvents } from '@lifeos/shared/supabase'
import { supabase } from '@/src/lib/supabase'
import { registerForPushNotificationsAsync, addNotificationResponseListener } from '@/src/notifications/setup'
import { cancelFocusNotifications } from '@/src/notifications/focus'
import { initRevenueCat } from '@/src/utils/purchases'
import { useHealthStore } from '@/src/stores/healthStore'
import { hasSeenOnboarding } from '@/src/onboarding/storage'
import { persistWidgetSnapshot } from '@/src/widgets/storage'
import { LangProvider } from '@/src/contexts/LangContext'
import { ThemeProvider, useTheme } from '@/src/contexts/ThemeContext'
import { SubscriptionProvider } from '@/src/contexts/SubscriptionContext'
import '../global.css'

WebBrowser.maybeCompleteAuthSession()

// Ölçüm olaylarına platform yazılsın: Play yayına çıktığında iOS ve Android
// hunileri ayrı okunabilmeli, tek birleşik oran hangisinin tıkandığını gizler.
configureEvents(Platform.OS)

function AppNavigator() {
  const { isDark } = useTheme()
  const [session, setSession] = useState<Session | null>(null)
  const [initialized, setInitialized] = useState(false)
  const notifRef = useRef<ReturnType<typeof addNotificationResponseListener> | null>(null)
  const passwordRecoveryRef = useRef(false)
  const focusPersist = useRef<{ userId: string; stop?: () => void } | null>(null)

  async function handleAuthUrl(url: string | null) {
    if (!url || !url.includes('reset-password')) return
    const params = new URLSearchParams(url.replace('#', '?').split('?')[1] ?? '')
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    if (!accessToken || !refreshToken) return

    passwordRecoveryRef.current = true
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
    if (!error) router.replace('/(auth)/reset-password' as never)
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'INITIAL_SESSION') setInitialized(true)
      if (s?.user) {
        void registerForPushNotificationsAsync()
        void initRevenueCat(s.user.id)
        // Süren odak uygulama kapanınca kaybolmasın: kullanıcı başına bir kez bağlanır.
        if (focusPersist.current?.userId !== s.user.id) {
          const userId = s.user.id
          focusPersist.current?.stop?.()
          const entry: { userId: string; stop?: () => void } = { userId }
          focusPersist.current = entry
          void persistFocus(AsyncStorage, userId).then((stop) => {
            if (focusPersist.current === entry) entry.stop = stop
            else stop()
          })
        }
      }
      // Çıkışta başka kullanıcının sağlık verisi ve widget'ı cihazda kalmasın
      if (event === 'SIGNED_OUT') {
        useHealthStore.getState().reset()
        useGoalStore.getState().reset()
        useFocusStore.getState().reset()
        focusPersist.current?.stop?.()
        focusPersist.current = null
        void cancelFocusNotifications()
        void persistWidgetSnapshot(emptyWidgetSnapshot())
      }
    })

    notifRef.current = addNotificationResponseListener((path) => router.push(path as never))
    void Linking.getInitialURL().then(handleAuthUrl)
    const urlSubscription = Linking.addEventListener('url', ({ url }) => void handleAuthUrl(url))

    return () => {
      subscription.unsubscribe()
      notifRef.current?.remove()
      urlSubscription.remove()
    }
  }, [])

  useEffect(() => {
    if (!initialized) return
    if (session && passwordRecoveryRef.current) {
      router.replace('/(auth)/reset-password' as never)
      return
    }
    if (!session) {
      router.replace('/(auth)/login')
      return
    }

    // Turu daha once gormeyen kullanici once tanitima girer. Depolama
    // okunamazsa tur gosterilir; akis hicbir durumda kilitlenmez.
    let active = true
    const userId = session.user.id
    void hasSeenOnboarding(userId).then((seen) => {
      if (!active) return
      // /onboarding yeni bir rota; expo-router tip uretimi guncellenene kadar cast gerekiyor.
      router.replace((seen ? '/(tabs)/today' : '/onboarding') as never)
    })
    return () => { active = false }
  }, [session, initialized])

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="task/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="exercise/[id]" />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  )
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <LangProvider>
        <SubscriptionProvider>
          <AppNavigator />
        </SubscriptionProvider>
      </LangProvider>
    </ThemeProvider>
  )
}
