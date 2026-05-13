import { useEffect, useRef, useState } from 'react'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import type { Session } from '@supabase/supabase-js'
import * as WebBrowser from 'expo-web-browser'
import { supabase } from '@/src/lib/supabase'
import {
  registerForPushNotificationsAsync,
  addNotificationResponseListener,
} from '@/src/notifications/setup'
import { LangProvider } from '@/src/contexts/LangContext'
import { ThemeProvider } from '@/src/contexts/ThemeContext'
import '../global.css'

WebBrowser.maybeCompleteAuthSession()

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null)
  const [initialized, setInitialized] = useState(false)
  const notificationListenerRef = useRef<ReturnType<typeof addNotificationResponseListener> | null>(null)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'INITIAL_SESSION') {
        setInitialized(true)
      }
      if (s?.user) {
        void registerForPushNotificationsAsync()
      }
    })

    // Notification tıklama listener — Expo Router navigate ile
    notificationListenerRef.current = addNotificationResponseListener((path) => {
      router.push(path as never)
    })

    return () => {
      subscription.unsubscribe()
      notificationListenerRef.current?.remove()
    }
  }, [])

  useEffect(() => {
    if (!initialized) return
    if (session) {
      router.replace('/(tabs)/today')
    } else {
      router.replace('/(auth)/login')
    }
  }, [session, initialized])

  return (
    <ThemeProvider>
      <LangProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="task/[id]" options={{ presentation: 'modal' }} />
        </Stack>
      </LangProvider>
    </ThemeProvider>
  )
}
