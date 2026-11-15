import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/src/lib/supabase'
import { deriveAccountStage, isAnonymousStage, type AccountStage } from '@/src/auth/accountStage'

export interface AuthState {
  /** İlk oturum okuması bitti mi (INITIAL_SESSION geldi mi) */
  initialized: boolean
  session: Session | null
  userId: string | null
  /** Oturum yoksa null */
  stage: AccountStage | null
  /** guest ve pending_email: kullanıcı hâlâ anonim */
  isAnonymous: boolean
  /** Onay bekleyen e-posta; kodu girme ekranı bunu Auth'tan okur */
  pendingEmail: string | null
  /** Sunucudaki güncel kullanıcıyı çeker; aşama buna göre yeniden hesaplanır */
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  initialized: false,
  session: null,
  userId: null,
  stage: null,
  isAnonymous: false,
  pendingEmail: null,
  refreshUser: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [initialized, setInitialized] = useState(false)
  const passwordRefreshed = useRef<string | null>(null)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      setUser(s?.user ?? null)
      if (event === 'INITIAL_SESSION') setInitialized(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  const userId = session?.user.id ?? null

  const refreshUser = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase.auth.getUser()
    // Çevrimdışıyken eldeki kullanıcı kalır; başka kullanıcıya ait yanıt uygulanmaz.
    if (!error && data.user && data.user.id === userId) setUser(data.user)
  }, [userId])

  const stage = deriveAccountStage(user)
  const isReady = stage === 'ready'

  // Anonim oturum açılırken ve uygulama öne gelirken: bekleyen e-posta başka cihazda ya da uygulama kapalıyken değişmiş olabilir.
  useEffect(() => {
    if (!userId) return
    if (!isReady) void refreshUser()
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refreshUser()
    })
    return () => sub.remove()
  }, [userId, isReady, refreshUser])

  // Şifresi sunucuda yeni belirlenmiş olabilir: JWT ve metadata bir kez tazelenir.
  useEffect(() => {
    if (stage !== 'needs_password' || !userId || passwordRefreshed.current === userId) return
    passwordRefreshed.current = userId
    void supabase.auth.refreshSession()
  }, [stage, userId])

  const value = useMemo<AuthState>(() => ({
    initialized,
    session,
    userId,
    stage: userId ? stage : null,
    isAnonymous: isAnonymousStage(stage),
    pendingEmail: user?.new_email ?? null,
    refreshUser,
  }), [initialized, session, userId, stage, user?.new_email, refreshUser])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  return useContext(AuthContext)
}
