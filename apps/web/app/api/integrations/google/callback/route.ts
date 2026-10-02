import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { connectGoogle } from '@/lib/integrations/connect'
import { googleCredentials } from '@/lib/integrations/google'
import { consumeState, finish, handOffToApp, isExpired, isMobileReturn } from '@/lib/integrations/handoff'
import { returnsToStarter } from '@/lib/integrations/oauth'

export const runtime = 'nodejs'

/**
 * Google yetki dönüşü: state'i tüketir (tek kullanım, 10 dk). Web'de kodu PKCE ile token'a
 * çevirip bağlantıyı kurar; mobilde kodu uygulamaya devreder, bağlantıyı uygulama /complete
 * ile bitirir.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const admin = createAdminClient()
  const saved = await consumeState(admin, params.get('state') ?? '', 'google_calendar')
  if (!saved) return NextResponse.json({ ok: false, error: 'Geçersiz ya da süresi dolmuş istek' }, { status: 400 })
  if (isExpired(saved)) return finish(req, 'google', saved.redirect_to, 'error')
  if (params.get('error')) return finish(req, 'google', saved.redirect_to, 'denied')

  const code = params.get('code')
  if (!googleCredentials() || !code) return finish(req, 'google', saved.redirect_to, 'error')
  if (isMobileReturn(saved.redirect_to)) return handOffToApp(req, admin, 'google', 'google_calendar', saved, code)
  if (!(await returnsToStarter(req, saved.user_id))) return finish(req, 'google', saved.redirect_to, 'error')

  try {
    return finish(req, 'google', saved.redirect_to, await connectGoogle(req, saved.user_id, saved.code_verifier, code))
  } catch (err) {
    console.error('google/callback:', err instanceof Error ? err.message : 'unknown')
    return finish(req, 'google', saved.redirect_to, 'error')
  }
}
