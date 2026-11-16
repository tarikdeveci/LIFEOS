import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import { Stack, router, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as Linking from 'expo-linking'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as WebBrowser from 'expo-web-browser'
import { persistFocus } from '@lifeos/shared'
import { configureEvents } from '@lifeos/shared/supabase'
import { supabase } from '@/src/lib/supabase'
import { registerForPushNotificationsAsync, addNotificationResponseListener, handleInitialNotification } from '@/src/notifications/setup'
import { bootstrapGuest, hadSession, markHadSession } from '@/src/auth/bootstrap'
import { resetLocalUserState } from '@/src/auth/resetLocalState'
import { hasSeenOnboarding } from '@/src/onboarding/storage'
import { AuthProvider, useAuth } from '@/src/contexts/AuthContext'
import { LangProvider } from '@/src/contexts/LangContext'
import { ThemeProvider, useTheme } from '@/src/contexts/ThemeContext'
import { SubscriptionProvider } from '@/src/contexts/SubscriptionContext'
import { SwipeBack } from '@/src/navigation/SwipeBack'
import { Celebration } from '@/src/components/Celebration'
import '../global.css'

WebBrowser.maybeCompleteAuthSession()

// Ölçüm olaylarına platform yazılsın: Play yayına çıktığında iOS ve Android
// hunileri ayrı okunabilmeli, tek birleşik oran hangisinin tıkandığını gizler.
configureEvents(Platform.OS)

function AppNavigator() {
  const { isDark } = useTheme()
  const { initialized, userId, isAnonymous } = useAuth()
  const notifRef = useRef<ReturnType<typeof addNotificationResponseListener> | null>(null)
  const passwordRecoveryRef = useRef(false)
  const prevUserId = useRef<string | null>(null)
  const guestBootstrapRan = useRef(false)

  // Yönlendirme efekti oturum nesnesi değil kullanıcı kimliğine bağlı; güncel değerleri ref'ten okur.
  const segments = useSegments()
  const inRegisterRef = useRef(false)
  inRegisterRef.current = (segments as string[]).includes('register')
  const isAnonymousRef = useRef(isAnonymous)
  isAnonymousRef.current = isAnonymous

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
    notifRef.current = addNotificationResponseListener((path) => router.push(path as never))
    void Linking.getInitialURL().then(handleAuthUrl)
    const urlSubscription = Linking.addEventListener('url', ({ url }) => void handleAuthUrl(url))

    return () => {
      notifRef.current?.remove()
      urlSubscription.remove()
    }
  }, [])

  // Kullanıcı kimliği değişince (çıkış, misafirden başka hesaba giriş) önceki kullanıcının
  // cihazdaki sağlık verisi, odak ve widget'ı temizlenir. Odak bağlama efektinden önce bildirilir.
  useEffect(() => {
    const prev = prevUserId.current
    prevUserId.current = userId
    if (prev && prev !== userId) resetLocalUserState()
  }, [userId])

  // Süren odak uygulama kapanınca kaybolmasın: kullanıcı başına bir kez bağlanır.
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    let stop: (() => void) | undefined
    void persistFocus(AsyncStorage, userId).then((s) => {
      if (cancelled) s()
      else stop = s
    })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [userId])

  // Oturum (misafir dahil) açıldıysa işaretlenir: çıkış yapan kullanıcıya otomatik misafir açılmaz.
  useEffect(() => {
    if (userId) void markHadSession()
  }, [userId])

  // Misafir ilk açılışta izin penceresi çıkarmaz; izin anlamlı bir anda istenir (ilk kaydedilen blok, bildirim ayarları).
  useEffect(() => {
    if (!userId) return
    void registerForPushNotificationsAsync({ prompt: !isAnonymous })
  }, [userId, isAnonymous])

  useEffect(() => {
    if (!initialized) return

    if (!userId) {
      // Oturum yok: cihazda hiç oturum açılmamışsa misafir başlar, aksi halde giriş ekranı.
      let active = true
      void (async () => {
        if (!guestBootstrapRan.current && !(await hadSession())) {
          guestBootstrapRan.current = true
          if (await bootstrapGuest()) return
        }
        if (active) router.replace('/(auth)/login')
      })()
      return () => { active = false }
    }

    if (passwordRecoveryRef.current) {
      router.replace('/(auth)/reset-password' as never)
      return
    }
    // Hesap oluşturma ekranında oturum ortada açılır ya da güncellenir; kullanıcı akıştan atılmaz.
    if (isAnonymousRef.current && inRegisterRef.current) return

    // Turu daha once gormeyen kullanici once tanitima girer. Depolama
    // okunamazsa tur gosterilir; akis hicbir durumda kilitlenmez.
    let active = true
    void hasSeenOnboarding(userId).then((seen) => {
      if (!active) return
      // /onboarding yeni bir rota; expo-router tip uretimi guncellenene kadar cast gerekiyor.
      router.replace((seen ? '/(tabs)/today' : '/onboarding') as never)
      // Yönlendirme hazır: listener açılır, kapalıyken dokunulan bildirim varsa ana ekrandan sonra açılır.
      void handleInitialNotification((path) => router.push(path as never))
    })
    return () => { active = false }
  }, [userId, initialized])

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SwipeBack>
        {/* İleri giden ekranlar sağdan kayar; giriş, sekmeler ve tanıtım arasındaki geçiş solar. */}
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          <Stack.Screen name="index" options={{ animation: 'fade' }} />
          <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
          <Stack.Screen name="task/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="exercise/[id]" />
          <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
          <Stack.Screen name="account-gate" options={{ presentation: 'modal' }} />
        </Stack>
      </SwipeBack>
      <Celebration />
    </>
  )
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <LangProvider>
        <AuthProvider>
          <SubscriptionProvider>
            <AppNavigator />
          </SubscriptionProvider>
        </AuthProvider>
      </LangProvider>
    </ThemeProvider>
  )
}
