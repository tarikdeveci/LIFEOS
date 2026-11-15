import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { ACCOUNT_REQUIRED_BODY, isPermanentAccount, type GateUser } from '@/lib/api/accountGate'

type ApiSupabase = Awaited<ReturnType<typeof createServerClient>>

export interface ApiAuth {
  supabase: ApiSupabase
  userId: string
  isAnonymous: boolean
  emailConfirmed: boolean
}

/**
 * API rotaları için oturum: web çerezden, mobil "Authorization: Bearer <supabase erişim
 * anahtarı>" ile gelir. Dönen istemci kullanıcı adına çalışır (RLS geçerli).
 */
export async function authenticateRequest(req: Request): Promise<ApiAuth | null> {
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1]?.trim()
  const supabase: ApiSupabase = bearer
    ? createClient(process.env['NEXT_PUBLIC_SUPABASE_URL']!, process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : await createServerClient()
  const { data: { user } } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser()
  return user
    ? {
        supabase,
        userId: user.id,
        isAnonymous: user.is_anonymous === true,
        emailConfirmed: Boolean(user.email_confirmed_at),
      }
    : null
}

/** Kalıcı ve onaylı hesap değilse 403 `account_required` döner, değilse null. */
export function requirePermanent(auth: { isAnonymous: boolean; emailConfirmed: boolean }) {
  return auth.isAnonymous || !auth.emailConfirmed ? accountRequiredResponse() : null
}

/** Kendi `getUser()` çağrısını yapan rotalar (çerez oturumu) için aynı kapı. */
export function requirePermanentUser(user: GateUser) {
  return isPermanentAccount(user) ? null : accountRequiredResponse()
}

function accountRequiredResponse() {
  return NextResponse.json(ACCOUNT_REQUIRED_BODY, { status: 403 })
}
