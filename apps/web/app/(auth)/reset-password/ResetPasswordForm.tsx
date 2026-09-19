'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'

const inputCls =
  'w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20'

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'done' }
  | { kind: 'error'; message: string }

/**
 * 2FA açık hesapta şifre güncellemesi aal2 oturum ister; sıfırlama bağlantısı
 * ise aal1 oturum açar. Böyle bir hesapta TOTP faktörünün id'si döner, form da
 * şifreyle birlikte doğrulama kodunu ister.
 */
function usePendingMfaFactor(): string | null {
  const [factorId, setFactorId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal?.nextLevel !== 'aal2' || aal.currentLevel === 'aal2') return
      const { data: factors } = await supabase.auth.mfa.listFactors()
      if (active) setFactorId(factors?.totp?.[0]?.id ?? null)
    })()
    return () => { active = false }
  }, [])

  return factorId
}

export function ResetPasswordForm() {
  const factorId = usePendingMfaFactor()
  const [fields, setFields] = useState({ password: '', confirm: '', code: '' })
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (fields.password.length < 8) {
      setStatus({ kind: 'error', message: 'Şifre en az 8 karakter olmalı.' })
      return
    }
    if (fields.password !== fields.confirm) {
      setStatus({ kind: 'error', message: 'Şifreler eşleşmiyor.' })
      return
    }
    setStatus({ kind: 'saving' })
    try {
      if (factorId) {
        const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
        if (challengeError) throw challengeError
        const { error: verifyError } = await supabase.auth.mfa.verify({
          factorId,
          challengeId: challenge.id,
          code: fields.code.trim(),
        })
        if (verifyError) throw verifyError
      }
      const { error } = await supabase.auth.updateUser({ password: fields.password })
      if (error) throw error
      setStatus({ kind: 'done' })
    } catch (err: unknown) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Şifre güncellenemedi.' })
    }
  }

  if (status.kind === 'done') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
          <p className="text-sm font-semibold text-primary">Şifren güncellendi</p>
          <p className="mt-1 text-xs text-muted">Bundan sonra yeni şifrenle giriş yapabilirsin.</p>
        </div>
        <Link href="/dashboard"
          className="block w-full rounded-lg bg-accent px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-accent/90">
          Panele git
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div>
        <label htmlFor="newPassword" className="mb-1 block text-sm font-medium text-primary">Yeni şifre</label>
        <input id="newPassword" type="password" value={fields.password} autoFocus required minLength={8}
          onChange={(e) => setFields((f) => ({ ...f, password: e.target.value }))}
          className={inputCls} placeholder="En az 8 karakter" autoComplete="new-password" />
      </div>
      <div>
        <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-primary">Yeni şifre (tekrar)</label>
        <input id="confirmPassword" type="password" value={fields.confirm} required minLength={8}
          onChange={(e) => setFields((f) => ({ ...f, confirm: e.target.value }))}
          className={inputCls} autoComplete="new-password" />
      </div>
      {factorId && (
        <div>
          <label htmlFor="mfaCode" className="mb-1 block text-sm font-medium text-primary">Doğrulama kodu</label>
          <input id="mfaCode" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required
            value={fields.code} onChange={(e) => setFields((f) => ({ ...f, code: e.target.value }))}
            className={`${inputCls} text-center tracking-widest`} placeholder="123456" autoComplete="one-time-code" />
          <p className="mt-1 text-xs text-muted">Hesabında iki faktörlü doğrulama açık; uygulamandaki 6 haneli kodu gir.</p>
        </div>
      )}
      {status.kind === 'error' && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-danger">{status.message}</p>}
      <button type="submit" disabled={status.kind === 'saving'}
        className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-60">
        {status.kind === 'saving' ? 'Kaydediliyor...' : 'Şifremi güncelle'}
      </button>
    </form>
  )
}
