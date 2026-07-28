import { useEffect, useRef, useState } from 'react'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as Linking from 'expo-linking'
import type { Session } from '@supabase/supabase-js'
import * as WebBrowser from 'expo-web-browser'
import { supabase } from '@/src/lib/supabase'
import { registerForPushNotificationsAsync, addNotificationResponseListener } from '@/src/notifications/setup'
import { initRevenueCat } from '@/src/utils/purchases'
import { LangProvider } from '@/src/contexts/LangContext'
import { ThemeProvider, useTheme } from '@/src/contexts/ThemeContext'
import { SubscriptionProvider } from '@/src/contexts/SubscriptionContext'
import '../global.css'

WebBrowser.maybeCompleteAuthSession()

function AppNavigator() {
  const { isDark } = useTheme()
  const [session, setSession] = useState<Session | null>(null)
  const [initialized, setInitialized] = useState(false)
  const notifRef = useRef<ReturnType<typeof addNotificationResponseListener> | null>(null)
  const passwordRecoveryRef = useRef(false)

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
    if (session && passwordRecoveryRef.current) router.replace('/(auth)/reset-password' as never)
    else if (session) router.replace('/(tabs)/today')
    else router.replace('/(auth)/login')
  }, [session, initialized])

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="task/[id]" options={{ presentation: 'modal' }} />
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
