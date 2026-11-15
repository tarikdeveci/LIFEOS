'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

const RESEND_COOLDOWN_S = 60

interface ConfirmEmailPendingProps {
  email: string
  onBack: () => void
}

/**
 * "Confirm email" açıkken kayıt oturum döndürmez (spec 2026-10-20 bölüm 6.6). Kullanıcı
 * e-postadaki bağlantıyla onaylar, bağlantı /auth/callback üzerinden panele düşer.
 */
export function ConfirmEmailPending({ email, onBack }: ConfirmEmailPendingProps) {
  // Bitis zamani saklanir: bilgisayar uyuyunca zamanlayici durur, kalan sure saatten hesaplanir.
  const [cooldownEnd, setCooldownEnd] = useState(() => Date.now() + RESEND_COOLDOWN_S * 1000)
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshCooldown = useCallback(() => {
    setCooldown(Math.max(0, Math.ceil((cooldownEnd - Date.now()) / 1000)))
  }, [cooldownEnd])

  useEffect(() => {
    refreshCooldown()
    const id = setInterval(refreshCooldown, 1000)
    document.addEventListener('visibilitychange', refreshCooldown)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', refreshCooldown)
    }
  }, [refreshCooldown])

  async function handleResend() {
    setSending(true)
    setError(null)
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
    })
    setSending(false)
    if (resendError) {
      setError(resendError.message)
      return
    }
    setCooldownEnd(Date.now() + RESEND_COOLDOWN_S * 1000)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
        <p className="text-sm font-semibold text-primary">E-postana gelen bağlantıyla hesabını onayla</p>
        <p className="mt-1 text-xs text-muted">
          {email} adresine bir onay bağlantısı gönderdik. Bağlantıyı bu tarayıcıda açınca panele geçersin.
        </p>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-danger">{error}</p>}
      <button
        type="button"
        onClick={() => void handleResend()}
        disabled={sending || cooldown > 0}
        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-gray-50 disabled:opacity-60"
      >
        {cooldown > 0 ? `Tekrar gönder (${cooldown} sn)` : sending ? 'Gönderiliyor...' : 'Tekrar gönder'}
      </button>
      <button type="button" onClick={onBack} className="w-full text-xs text-muted hover:text-primary">
        Girişe dön
      </button>
    </div>
  )
}
