import { useEffect, useRef, useState } from 'react'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
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

    return () => {
      subscription.unsubscribe()
      notifRef.current?.remove()
    }
  }, [])

  useEffect(() => {
    if (!initialized) return
    if (session) router.replace('/(tabs)/today')
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
