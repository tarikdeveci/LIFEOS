// Supabase Auth hatasını kullanıcıya gösterilecek i18n anahtarına çevirir. Ham İngilizce ileti
// ("Invalid login credentials") ekrana çıkmaz (persona turu 2026-11-17).

export type LoginErrorKey =
  | 'acc_login_err_credentials'
  | 'acc_login_err_unconfirmed'
  | 'acc_login_err_rate_limit'
  | 'acc_login_err_network'
  | 'acc_login_err_generic'

interface AuthLikeError { code?: string; message?: string; status?: number; name?: string }

function asAuthError(error: unknown): AuthLikeError {
  return typeof error === 'object' && error !== null ? (error as AuthLikeError) : {}
}

export function loginErrorKey(error: unknown): LoginErrorKey {
  const { code, message = '', status, name } = asAuthError(error)
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) return 'acc_login_err_credentials'
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(message)) return 'acc_login_err_unconfirmed'
  if (status === 429 || (code?.startsWith('over_') && code.endsWith('rate_limit'))) return 'acc_login_err_rate_limit'
  if (name === 'AuthRetryableFetchError' || /network request failed|failed to fetch/i.test(message)) return 'acc_login_err_network'
  return 'acc_login_err_generic'
}
