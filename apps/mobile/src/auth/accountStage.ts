// Hesap aşaması: misafir, e-posta onayı bekleyen, şifre bekleyen ya da tam hesap.
// Saf mantık: React ve Supabase istemcisine bağlı değil, tests/mobile altında denenir.

export type AccountStage = 'guest' | 'pending_email' | 'needs_password' | 'ready'

export interface StageIdentity {
  provider: string
}

export interface StageUser {
  is_anonymous?: boolean
  email?: string | null
  new_email?: string | null
  email_confirmed_at?: string | null
  identities?: StageIdentity[] | null
  user_metadata?: Record<string, unknown> | null
}

export function deriveAccountStage(user: StageUser | null | undefined): AccountStage | null {
  if (!user) return null
  if (user.is_anonymous) return user.new_email ? 'pending_email' : 'guest'
  const identities = user.identities ?? []
  const hasOAuth = identities.some((i) => i.provider !== 'email')
  const passwordSet = user.user_metadata?.password_set === true
  if (!user.email_confirmed_at && !hasOAuth) return 'pending_email'
  if (hasOAuth || passwordSet) return 'ready'
  return 'needs_password'
}

export function isAnonymousStage(stage: AccountStage | null): boolean {
  return stage === 'guest' || stage === 'pending_email'
}

const STAGES: readonly AccountStage[] = ['guest', 'pending_email', 'needs_password', 'ready']

export function parseStageHint(raw: string | null | undefined): AccountStage | null {
  return STAGES.find((s) => s === raw) ?? null
}
