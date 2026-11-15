import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/src/contexts/AuthContext'
import { useLang } from '@/src/contexts/LangContext'
import { bootstrapGuest } from '@/src/auth/bootstrap'
import {
  resendUpgradeCode, saveDisplayName, setAccountPassword, startUpgrade, verifyUpgradeCode,
  type UpgradeResult,
} from '@/src/auth/upgrade'

/** Supabase SMTP en az aralığıyla aynı: daha erken denemede sunucu zaten reddeder. */
export const RESEND_COOLDOWN_SECONDS = 60
const MIN_PASSWORD_LENGTH = 8

/**
 * Misafirden hesaba yükseltmenin adımları. Aşama (`stage`) sunucudaki gerçeği söyler:
 * guest -> form, pending_email -> kod, needs_password -> şifre, ready -> tamam.
 * Kayıtta girilen şifre yalnızca bu bileşenin belleğinde durur; kod doğrulanınca kendiliğinden kaydedilir.
 */
export function useUpgradeFlow() {
  const { stage, session, userId, pendingEmail, refreshUser } = useAuth()
  const { t } = useLang()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailTaken, setEmailTaken] = useState(false)
  const [info, setInfo] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [editingEmail, setEditingEmail] = useState(false)
  const [upgraded, setUpgraded] = useState(false)
  const passwordRef = useRef('')
  const nameRef = useRef('')

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const fail = useCallback((result: UpgradeResult, fallback: string) => {
    if (result.ok) return
    setEmailTaken(result.error === 'email_taken')
    setError(result.error === 'email_taken' ? t.upgrade_email_taken : result.error === 'code_invalid' ? t.upgrade_code_invalid : fallback)
  }, [t])

  const clearMessages = useCallback(() => {
    setError(null)
    setInfo(null)
    setEmailTaken(false)
  }, [])

  const storedName = (): string => {
    if (nameRef.current) return nameRef.current
    const meta = session?.user.user_metadata?.['display_name']
    return typeof meta === 'string' ? meta : ''
  }

  const submitForm = useCallback(async (displayName: string, email: string, password: string) => {
    clearMessages()
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t.upgrade_password_short)
      return
    }
    setBusy(true)
    try {
      // Oturum yoksa (girişten gelen yeni kullanıcı) önce misafir oturumu açılır, sonra aynı akış.
      if (!userId && !(await bootstrapGuest())) {
        setError(t.guest_start_failed)
        return
      }
      const result = await startUpgrade(email, displayName)
      if (!result.ok) {
        fail(result, t.upgrade_failed)
        return
      }
      passwordRef.current = password
      nameRef.current = displayName.trim()
      setEditingEmail(false)
      setCooldown(RESEND_COOLDOWN_SECONDS)
      await refreshUser()
    } finally {
      setBusy(false)
    }
  }, [userId, clearMessages, fail, refreshUser, t])

  const finish = useCallback(async (password: string): Promise<boolean> => {
    const result = await setAccountPassword(password)
    if (!result.ok) {
      fail(result, t.upgrade_failed)
      await refreshUser()
      return false
    }
    passwordRef.current = ''
    setUpgraded(true)
    if (userId) await saveDisplayName(userId, storedName())
    await refreshUser()
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, fail, refreshUser, t])

  const submitCode = useCallback(async (code: string) => {
    clearMessages()
    if (!pendingEmail) return
    setBusy(true)
    try {
      const result = await verifyUpgradeCode(pendingEmail, code)
      if (!result.ok) {
        fail(result, t.upgrade_failed)
        return
      }
      // Şifre bellekteyse ayrı ekran açılmaz; yoksa needs_password aşaması şifreyi ister.
      if (passwordRef.current) await finish(passwordRef.current)
      else await refreshUser()
    } finally {
      setBusy(false)
    }
  }, [pendingEmail, clearMessages, fail, finish, refreshUser, t])

  const submitPassword = useCallback(async (password: string) => {
    clearMessages()
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t.upgrade_password_short)
      return
    }
    setBusy(true)
    try {
      await finish(password)
    } finally {
      setBusy(false)
    }
  }, [clearMessages, finish, t])

  const resend = useCallback(async () => {
    if (cooldown > 0 || !pendingEmail) return
    clearMessages()
    setBusy(true)
    try {
      const result = await resendUpgradeCode(pendingEmail)
      if (result.ok) {
        setInfo(t.upgrade_resent)
        setCooldown(RESEND_COOLDOWN_SECONDS)
      } else fail(result, t.upgrade_failed)
    } finally {
      setBusy(false)
    }
  }, [cooldown, pendingEmail, clearMessages, fail, t])

  const changeEmail = useCallback(() => {
    clearMessages()
    setEditingEmail(true)
  }, [clearMessages])

  return {
    stage, pendingEmail, busy, error, info, emailTaken, cooldown, editingEmail, upgraded,
    submitForm, submitCode, submitPassword, resend, changeEmail,
  }
}
