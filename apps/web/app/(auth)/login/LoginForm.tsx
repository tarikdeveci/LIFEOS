'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useLang } from '@/lib/contexts/LangContext'

type Tab = 'login' | 'register'

const inputCls =
  'w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'

export default function AuthForm({ defaultTab = 'login' }: { defaultTab?: Tab }) {
  const router = useRouter()
  const { t } = useLang()
  const [tab, setTab] = useState<Tab>(defaultTab)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Login fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Register fields
  const [displayName, setDisplayName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')

  // MFA challenge
  const [mfaStep, setMfaStep] = useState(false)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaFactorId, setMfaFactorId] = useState('')
  const [mfaLoading, setMfaLoading] = useState(false)

  function switchTab(t: Tab) {
    setTab(t)
    setError(null)
    setMfaStep(false)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }
    // Check if MFA is required
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.nextLevel === 'aal2' && aal.nextLevel !== aal.currentLevel) {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totp = factors?.totp?.[0]
      if (totp) {
        setMfaFactorId(totp.id)
        setMfaStep(true)
        setLoading(false)
        return
      }
    }
    router.push('/dashboard')
    router.refresh()
  }

  async function handleMfaVerify(e: React.FormEvent) {
    e.preventDefault()
    setMfaLoading(true)
    setError(null)
    try {
      const { data: challenge } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId })
      if (!challenge) throw new Error('Challenge alınamadı')
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challenge.id,
        code: mfaCode.trim(),
      })
      if (verifyError) throw verifyError
      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Doğrulama başarısız')
    } finally {
      setMfaLoading(false)
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: regEmail,
      password: regPassword,
      options: { data: { display_name: displayName, timezone } },
    })
    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }
    if (data.user) {
      router.push('/dashboard')
      router.refresh()
    }
  }

  async function handleGoogleLogin() {
    setLoading(true)
    setError(null)
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
    })
    if (oauthError) {
      setError(oauthError.message)
      setLoading(false)
    }
  }

  // MFA challenge screen
  if (mfaStep) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-accent/5 border border-accent/20 p-4 text-center">
          <div className="mb-1 text-2xl">🔐</div>
          <p className="text-sm font-semibold text-primary">İki Faktörlü Doğrulama</p>
          <p className="mt-1 text-xs text-muted">Kimlik doğrulama uygulamanızdaki 6 haneli kodu girin</p>
        </div>
        <form onSubmit={(e) => void handleMfaVerify(e)} className="space-y-4">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            placeholder="123456"
            className={`${inputCls} text-center text-xl tracking-widest`}
            autoFocus
          />
          {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={mfaLoading || mfaCode.length !== 6}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-60"
          >
            {mfaLoading ? 'Doğrulanıyor...' : 'Doğrula ve Giriş Yap'}
          </button>
          <button
            type="button"
            onClick={() => { setMfaStep(false); setMfaCode(''); setError(null) }}
            className="w-full text-xs text-muted hover:text-primary"
          >
            Geri Dön
          </button>
        </form>
      </div>
    )
  }

  return (
    <div>
      {/* Tab toggle */}
      <div className="mb-6 flex rounded-xl bg-gray-100 p-1">
        <button type="button" onClick={() => switchTab('login')}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${tab === 'login' ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-primary'}`}>
          Giriş Yap
        </button>
        <button type="button" onClick={() => switchTab('register')}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${tab === 'register' ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-primary'}`}>
          Kayıt Ol
        </button>
      </div>

      {/* Google OAuth */}
      <button
        type="button"
        onClick={() => void handleGoogleLogin()}
        disabled={loading}
        className="mb-4 flex w-full items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        {t.auth_google}
      </button>

      <div className="mb-4 flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-muted">{t.auth_or}</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {tab === 'login' ? (
        <form onSubmit={(e) => void handleLogin(e)} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-primary">E-posta</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              required className={inputCls} placeholder="ornek@email.com" />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-primary">Şifre</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              required className={inputCls} placeholder="••••••••" />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-danger">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-60">
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>
      ) : (
        <form onSubmit={(e) => void handleRegister(e)} className="space-y-4">
          <div>
            <label htmlFor="displayName" className="mb-1 block text-sm font-medium text-primary">İsim</label>
            <input id="displayName" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
              required className={inputCls} placeholder="Adın Soyadın" />
          </div>
          <div>
            <label htmlFor="regEmail" className="mb-1 block text-sm font-medium text-primary">E-posta</label>
            <input id="regEmail" type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)}
              required className={inputCls} placeholder="ornek@email.com" />
          </div>
          <div>
            <label htmlFor="regPassword" className="mb-1 block text-sm font-medium text-primary">Şifre</label>
            <input id="regPassword" type="password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)}
              required minLength={8} className={inputCls} placeholder="En az 8 karakter" />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-danger">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-60">
            {loading ? 'Hesap oluşturuluyor...' : 'Kayıt Ol'}
          </button>
        </form>
      )}
    </div>
  )
}
