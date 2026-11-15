// Misafir modu sunucu kapısı (spec 2026-10-20 bölüm 9). Anonim (misafir) kullanıcı ya da
// e-postası onaylanmamış hesap model çağıramaz. `user_metadata.password_set` bakılmaz:
// istemci yazabildiği için güvenlik sınırı değil. Web karşılığı: apps/web/lib/api/accountGate.ts.

export interface GateUser {
  is_anonymous?: boolean | null
  email_confirmed_at?: string | null
}

export function isAccountRequired(user: GateUser): boolean {
  return user.is_anonymous === true || !user.email_confirmed_at
}
