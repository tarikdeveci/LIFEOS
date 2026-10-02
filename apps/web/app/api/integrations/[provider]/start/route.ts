import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { callbackUri, newPkce, returnTarget } from '@/lib/integrations/oauth'
import { providerBySlug, providerCredentials } from '@/lib/integrations/providers'

export const runtime = 'nodejs'

/**
 * Jira / Notion / Microsoft To Do / Slack bağlantısını başlatır: state (+ PKCE) üretir,
 * oauth_states'e yazar, yetki adresini döner. Body: { "platform": "web" | "mobile" }
 */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: slug } = await params
  const provider = providerBySlug(slug)
  if (!provider) return NextResponse.json({ ok: false, error: 'Bilinmeyen sağlayıcı' }, { status: 404 })

  const auth = await authenticateRequest(req)
  if (!auth) return NextResponse.json({ ok: false, error: 'Oturum gerekli' }, { status: 401 })

  const creds = providerCredentials(provider)
  if (!creds) return NextResponse.json({ ok: false, error: 'Bu bağlantı henüz açık değil' }, { status: 503 })

  let platform: 'web' | 'mobile' = 'web'
  try {
    const body = (await req.json()) as { platform?: unknown }
    if (body.platform === 'mobile') platform = 'mobile'
  } catch { /* gövdesiz istek: web */ }

  const admin = createAdminClient()
  await admin.from('oauth_states').delete().lt('created_at', new Date(Date.now() - 3600_000).toISOString())

  const pkce = newPkce()
  const { error } = await admin.from('oauth_states').insert({
    state: pkce.state,
    user_id: auth.userId,
    provider: provider.provider,
    code_verifier: pkce.verifier,
    redirect_to: returnTarget(platform, slug),
  })
  if (error) {
    console.error(`${slug}/start: state yazılamadı`, error.message)
    return NextResponse.json({ ok: false, error: 'Sunucu hatası' }, { status: 500 })
  }

  const url = provider.authorizeUrl({
    clientId: creds.clientId,
    redirectUri: callbackUri(req, slug),
    state: pkce.state,
    challenge: pkce.challenge,
  })
  return NextResponse.json({ ok: true, url })
}
