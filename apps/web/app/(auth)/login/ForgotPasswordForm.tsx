'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'

const inputCls =
  'w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'

interface ForgotPasswordFormProps {
  initialEmail: string
  onBack: () => void
}

export function ForgotPasswordForm({ initialEmail, onBack }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState(initialEmail)
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setError(null)
    // Bağlantı /auth/callback'te oturuma çevrilir, oradan yeni şifre sayfasına
    // geçilir. Mobil aynı işi lifeos:// ile yapıyor; web kullanıcısının telefonu
    // olmayabilir.
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })
    if (resetError) {
      setError(resetError.message)
      setStatus('idle')
      return
    }
    setStatus('sent')
  }

  if (status === 'sent') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
          <p className="text-sm font-semibold text-primary">E-postanı kontrol et</p>
          <p className="mt-1 text-xs text-muted">
            Bu adrese kayıtlı bir hesap varsa şifre sıfırlama bağlantısı gönderdik. Bağlantıyı
            bu tarayıcıda aç; başka bir tarayıcıda açılırsa doğrulanamaz.
          </p>
        </div>
        <button type="button" onClick={onBack} className="w-full text-xs text-muted hover:text-primary">
          Girişe dön
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-primary">Şifreni mi unuttun?</p>
        <p className="mt-1 text-xs text-muted">E-posta adresini yaz, yeni şifre belirlemen için bir bağlantı gönderelim.</p>
      </div>
      <div>
        <label htmlFor="resetEmail" className="mb-1 block text-sm font-medium text-primary">E-posta</label>
        <input id="resetEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          required autoFocus className={inputCls} placeholder="ornek@email.com" />
      </div>
      {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-danger">{error}</p>}
      <button type="submit" disabled={status === 'sending'}
        className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-60">
        {status === 'sending' ? 'Gönderiliyor...' : 'Sıfırlama bağlantısı gönder'}
      </button>
      <button type="button" onClick={onBack} className="w-full text-xs text-muted hover:text-primary">
        Girişe dön
      </button>
    </form>
  )
}
