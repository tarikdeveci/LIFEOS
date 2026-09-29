import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  GOOGLE_AUTH_URL, GOOGLE_RETURN, GOOGLE_SCOPES, googleCredentials, googleRedirectUri, newPkce,
  type GoogleReturn,
} from '@/lib/integrations/google'

export const runtime = 'nodejs'

/**
 * Google Calendar bağlantısını başlatır: state + PKCE üretir, oauth_states'e yazar,
 * yetki adresini döner. Web adrese gider, mobil expo-web-browser ile açar.
 * Body: { "platform": "web" | "mobile" }
 */
export async function POST(req: Request) {
  const auth = await authenticateRequest(req)
  if (!auth) return NextResponse.json({ ok: false, error: 'Oturum gerekli' }, { status: 401 })

  const creds = googleCredentials()
  if (!creds) return NextResponse.json({ ok: false, error: 'Google bağlantısı henüz açık değil' }, { status: 503 })

  let platform: GoogleReturn = 'web'
  try {
    const body = (await req.json()) as { platform?: unknown }
    if (body.platform === 'mobile') platform = 'mobile'
  } catch { /* gövdesiz istek: web */ }

  const admin = createAdminClient()
  // Yarım kalmış eski denemeler birikmesin.
  await admin.from('oauth_states').delete().lt('created_at', new Date(Date.now() - 3600_000).toISOString())

  const pkce = newPkce()
  const { error } = await admin.from('oauth_states').insert({
    state: pkce.state,
    user_id: auth.userId,
    provider: 'google_calendar',
    code_verifier: pkce.verifier,
    redirect_to: GOOGLE_RETURN[platform],
  })
  if (error) {
    console.error('google/start: state yazılamadı', error.message)
    return NextResponse.json({ ok: false, error: 'Sunucu hatası' }, { status: 500 })
  }

  const url = new URL(GOOGLE_AUTH_URL)
  url.searchParams.set('client_id', creds.clientId)
  url.searchParams.set('redirect_uri', googleRedirectUri(req))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', GOOGLE_SCOPES.join(' '))
  url.searchParams.set('access_type', 'offline')
  // Refresh token her bağlanışta gelsin (daha önce izin verilmişse Google vermiyor).
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('state', pkce.state)
  url.searchParams.set('code_challenge', pkce.challenge)
  url.searchParams.set('code_challenge_method', 'S256')

  return NextResponse.json({ ok: true, url: url.toString() })
}
