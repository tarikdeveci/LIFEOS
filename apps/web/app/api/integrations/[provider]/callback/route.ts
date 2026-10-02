import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { connectProvider } from '@/lib/integrations/connect'
import { consumeState, finish, handOffToApp, isExpired, isMobileReturn } from '@/lib/integrations/handoff'
import { returnsToStarter } from '@/lib/integrations/oauth'
import { providerBySlug, providerCredentials } from '@/lib/integrations/providers'

export const runtime = 'nodejs'

/**
 * Yetki dönüşü: state'i tüketir (tek kullanım, 10 dk). Web'de kodu token'a çevirip bağlantıyı
 * yazar; mobilde kodu uygulamaya devreder, bağlantıyı uygulama /complete ile bitirir.
 * Senkron 15 dakikalık cron'la başlar (integrations-sync).
 */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: slug } = await params
  const provider = providerBySlug(slug)
  if (!provider) return NextResponse.json({ ok: false, error: 'Bilinmeyen sağlayıcı' }, { status: 404 })

  const query = new URL(req.url).searchParams
  const admin = createAdminClient()
  const saved = await consumeState(admin, query.get('state') ?? '', provider.provider)
  if (!saved) return NextResponse.json({ ok: false, error: 'Geçersiz ya da süresi dolmuş istek' }, { status: 400 })
  if (isExpired(saved)) return finish(req, slug, saved.redirect_to, 'error')
  if (query.get('error')) return finish(req, slug, saved.redirect_to, 'denied')

  const code = query.get('code')
  if (!providerCredentials(provider) || !code) return finish(req, slug, saved.redirect_to, 'error')
  if (isMobileReturn(saved.redirect_to)) return handOffToApp(req, admin, slug, provider.provider, saved, code)
  if (!(await returnsToStarter(req, saved.user_id))) return finish(req, slug, saved.redirect_to, 'error')

  try {
    return finish(req, slug, saved.redirect_to, await connectProvider(req, slug, provider, saved.user_id, saved.code_verifier, code))
  } catch (err) {
    console.error(`${slug}/callback:`, err instanceof Error ? err.message : 'unknown')
    return finish(req, slug, saved.redirect_to, 'error')
  }
}
