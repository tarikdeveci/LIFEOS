/**
 * Misafir modu sunucu kapısı (spec 2026-10-20 bölüm 9). Para harcayan ya da üçüncü
 * tarafı çağıran rotalar kalıcı ve e-postası onaylı hesap ister. Mobil misafir
 * (anonim Supabase kullanıcısı) ve onaysız e-postalı hesap reddedilir.
 * `user_metadata.password_set` burada bakılmaz: istemci yazabildiği için güvenlik sınırı değil.
 */
export interface GateUser {
  is_anonymous?: boolean | null
  email_confirmed_at?: string | null
}

export function isPermanentAccount(user: GateUser): boolean {
  return user.is_anonymous !== true && Boolean(user.email_confirmed_at)
}

export const ACCOUNT_REQUIRED_BODY = { ok: false, error: 'Hesap gerekli', code: 'account_required' } as const
