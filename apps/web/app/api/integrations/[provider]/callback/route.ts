import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callbackUri, returnsToStarter } from '@/lib/integrations/oauth'
import { providerBySlug, providerCredentials } from '@/lib/integrations/providers'

export const runtime = 'nodejs'

const STATE_TTL_MS = 10 * 60 * 1000

function finish(req: Request, slug: string, redirectTo: string, status: 'ok' | 'error' | 'denied') {
  const target = redirectTo.startsWith('/')
    ? new URL(redirectTo, new URL(req.url).origin)
    : new URL(redirectTo)
  target.searchParams.set('integration', slug)
  target.searchParams.set('status', status)
  return NextResponse.redirect(target.toString(), 302)
}

/**
 * Yetki dönüşü: state'i tüketir (tek kullanım, 10 dk), kodu token'a çevirir, bağlantıyı
 * yazar, token'ı Vault'a koyar. Senkron 15 dakikalık cron'la başlar (integrations-sync).
 */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: slug } = await params
  const provider = providerBySlug(slug)
  if (!provider) return NextResponse.json({ ok: false, error: 'Bilinmeyen sağlayıcı' }, { status: 404 })

  const query = new URL(req.url).searchParams
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('oauth_states')
    .delete()
    .eq('state', query.get('state') ?? '')
    .eq('provider', provider.provider)
    .select('user_id, code_verifier, redirect_to, created_at')
    .maybeSingle()

  if (!row) return NextResponse.json({ ok: false, error: 'Geçersiz ya da süresi dolmuş istek' }, { status: 400 })
  const saved = row as { user_id: string; code_verifier: string; redirect_to: string; created_at: string }
  if (Date.now() - new Date(saved.created_at).getTime() > STATE_TTL_MS) return finish(req, slug, saved.redirect_to, 'error')
  if (!(await returnsToStarter(req, saved.redirect_to, saved.user_id))) return finish(req, slug, saved.redirect_to, 'error')
  if (query.get('error')) return finish(req, slug, saved.redirect_to, 'denied')

  const creds = providerCredentials(provider)
  const code = query.get('code')
  if (!creds || !code) return finish(req, slug, saved.redirect_to, 'error')

  try {
    const connected = await provider.exchange({
      code, redirectUri: callbackUri(req, slug), verifier: saved.code_verifier, creds,
    })

    if (provider.provider === 'slack') {
      // Bir Slack kullanıcısı tek LifeOS hesabına bağlanır: komut kime yazılacağı belli olsun.
      await admin.from('integrations').delete()
        .eq('provider', 'slack')
        .eq('settings->>team_id', String(connected.settings['team_id']))
        .eq('settings->>slack_user_id', String(connected.settings['slack_user_id']))
        .neq('user_id', saved.user_id)
    }

    // Yeniden bağlanınca önceki seçimler (Notion veritabanı gibi) korunur.
    const { data: previous } = await admin
      .from('integrations')
      .select('settings')
      .eq('user_id', saved.user_id)
      .eq('provider', provider.provider)
      .eq('account_label', connected.accountLabel)
      .maybeSingle()
    const settings = { ...((previous as { settings?: Record<string, unknown> } | null)?.settings ?? {}), ...connected.settings }

    const { data: integration, error } = await admin
      .from('integrations')
      .upsert(
        {
          user_id: saved.user_id,
          provider: provider.provider,
          account_label: connected.accountLabel,
          status: 'active',
          last_error: null,
          settings,
        },
        { onConflict: 'user_id,provider,account_label' },
      )
      .select('id')
      .single()
    if (error || !integration) throw new Error(error?.message ?? 'integration')

    if (connected.secret) {
      const { error: secretError } = await admin.rpc('integration_set_secret', {
        p_integration: (integration as { id: string }).id,
        p_secret: JSON.stringify(connected.secret),
      })
      if (secretError) throw new Error(secretError.message)
    }
    return finish(req, slug, saved.redirect_to, 'ok')
  } catch (err) {
    console.error(`${slug}/callback:`, err instanceof Error ? err.message : 'unknown')
    return finish(req, slug, saved.redirect_to, 'error')
  }
}
