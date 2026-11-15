import { supabase } from '@/src/lib/supabase'

export type UpgradeError = 'email_taken' | 'code_invalid' | 'failed'
export type UpgradeResult = { ok: true } | { ok: false; error: UpgradeError }

const FAILED: UpgradeResult = { ok: false, error: 'failed' }

interface AuthLikeError { code?: string; message?: string; status?: number }

/** E-posta başka hesaba ait mi: Auth hata kodu ya da iletinin sınıflandırması. */
export function isEmailTaken(error: AuthLikeError): boolean {
  if (error.code === 'email_exists' || error.code === 'user_already_exists') return true
  return /already (been )?registered|already exists|email.*(taken|in use)/i.test(error.message ?? '')
}

function timezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return undefined
  }
}

/** Aşama 1: e-postayı bağlar, Auth 6 haneli kodu o adrese yollar. */
export async function startUpgrade(email: string, displayName: string): Promise<UpgradeResult> {
  const tz = timezone()
  const { error } = await supabase.auth.updateUser({
    email: email.trim(),
    data: { display_name: displayName.trim(), ...(tz ? { timezone: tz } : {}) },
  })
  if (!error) return { ok: true }
  return isEmailTaken(error) ? { ok: false, error: 'email_taken' } : FAILED
}

/** Aşama 2: kodu doğrular; başarıda e-posta hesaba işlenir. */
export async function verifyUpgradeCode(email: string, code: string): Promise<UpgradeResult> {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email_change' })
  if (!error) return { ok: true }
  return error.status === 429 ? FAILED : { ok: false, error: 'code_invalid' }
}

export async function resendUpgradeCode(email: string): Promise<UpgradeResult> {
  const { error } = await supabase.auth.resend({ type: 'email_change', email: email.trim() })
  return error ? FAILED : { ok: true }
}

/** Aşama 3: şifreyi koyar ve "şifre belirlendi" işaretini yazar; JWT bir kez tazelenir. */
export async function setAccountPassword(password: string): Promise<UpgradeResult> {
  const { error } = await supabase.auth.updateUser({ password, data: { password_set: true } })
  if (error) return FAILED
  await supabase.auth.refreshSession()
  return { ok: true }
}

/** Görünen adı profil tablosuna yazar; başarısızlık hesabı bozmaz, sessizce geçilir. */
export async function saveDisplayName(userId: string, displayName: string): Promise<void> {
  const name = displayName.trim()
  if (!name) return
  await supabase.from('user_profiles').update({ display_name: name }).eq('id', userId)
}
