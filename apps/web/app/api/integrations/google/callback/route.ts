import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  GOOGLE_CAL_API, GOOGLE_TOKEN_URL, googleCredentials, googleRedirectUri,
} from '@/lib/integrations/google'
import { returnsToStarter } from '@/lib/integrations/oauth'

export const runtime = 'nodejs'

const STATE_TTL_MS = 10 * 60 * 1000

function finish(req: Request, redirectTo: string, status: 'ok' | 'error' | 'denied') {
  const target = redirectTo.startsWith('/')
    ? new URL(redirectTo, new URL(req.url).origin)
    : new URL(redirectTo)
  target.searchParams.set('integration', 'google')
  target.searchParams.set('status', status)
  return NextResponse.redirect(target.toString(), 302)
}

/**
 * Google yetki dönüşü: state'i tüketir (tek kullanım, 10 dk), kodu PKCE ile token'a
 * çevirir, refresh token'ı Vault'a yazar, "LifeOS" takvimini açar (yoksa) ve mevcut
 * blokları ilk senkron için kuyruğa alır. Sonra web ayarlarına ya da mobil derin
 * bağlantıya döner.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const state = params.get('state') ?? ''
  const admin = createAdminClient()

  const { data: row } = await admin
    .from('oauth_states')
    .delete()
    .eq('state', state)
    .eq('provider', 'google_calendar')
    .select('user_id, code_verifier, redirect_to, created_at')
    .maybeSingle()

  if (!row) return NextResponse.json({ ok: false, error: 'Geçersiz ya da süresi dolmuş istek' }, { status: 400 })
  const saved = row as { user_id: string; code_verifier: string; redirect_to: string; created_at: string }
  if (Date.now() - new Date(saved.created_at).getTime() > STATE_TTL_MS) return finish(req, saved.redirect_to, 'error')
  if (!(await returnsToStarter(req, saved.redirect_to, saved.user_id))) return finish(req, saved.redirect_to, 'error')
  if (params.get('error')) return finish(req, saved.redirect_to, 'denied')

  const creds = googleCredentials()
  const code = params.get('code')
  if (!creds || !code) return finish(req, saved.redirect_to, 'error')

  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        redirect_uri: googleRedirectUri(req),
        grant_type: 'authorization_code',
        code_verifier: saved.code_verifier,
      }),
    })
    const tokens = (await tokenRes.json()) as { access_token?: string; refresh_token?: string; scope?: string }
    if (!tokenRes.ok || !tokens.access_token) throw new Error(`token ${tokenRes.status}`)
    // Kullanıcı onay ekranında dolu/boş iznini kaldırabilir; takvimsiz bağlantı işe yaramaz.
    if (!tokens.scope?.includes('calendar.app.created')) return finish(req, saved.redirect_to, 'denied')

    const { data: integration, error: upsertError } = await admin
      .from('integrations')
      .upsert(
        { user_id: saved.user_id, provider: 'google_calendar', account_label: '', status: 'active', last_error: null },
        { onConflict: 'user_id,provider,account_label' },
      )
      .select('id, settings, secret_id')
      .single()
    if (upsertError || !integration) throw new Error(upsertError?.message ?? 'integration')
    const current = integration as { id: string; settings: { calendar_id?: string } | null; secret_id: string | null }

    if (tokens.refresh_token) {
      const { error } = await admin.rpc('integration_set_secret', {
        p_integration: current.id,
        p_secret: JSON.stringify({ refresh_token: tokens.refresh_token }),
      })
      if (error) throw new Error(error.message)
    } else if (!current.secret_id) {
      throw new Error('refresh token gelmedi')
    }

    let calendarId = current.settings?.calendar_id
    // Başka bir Google hesabıyla yeniden bağlanıldıysa (ya da takvim Google'da silindiyse)
    // kayıtlı takvim bu token'la bulunmaz; eski kimlik kalırsa her senkron 404 alır.
    if (calendarId) {
      const found = await fetch(`${GOOGLE_CAL_API}/calendars/${encodeURIComponent(calendarId)}`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      if (found.status === 404) calendarId = undefined
    }
    if (!calendarId) {
      const { data: prefs } = await admin.from('notification_preferences').select('timezone').eq('user_id', saved.user_id).maybeSingle()
      const calRes = await fetch(`${GOOGLE_CAL_API}/calendars`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: 'LifeOS', timeZone: (prefs as { timezone?: string } | null)?.timezone ?? 'Europe/Istanbul' }),
      })
      if (!calRes.ok) throw new Error(`calendar ${calRes.status}`)
      calendarId = ((await calRes.json()) as { id: string }).id
      const { error } = await admin.from('integrations')
        .update({ settings: { ...(current.settings ?? {}), calendar_id: calendarId } })
        .eq('id', current.id)
      if (error) throw new Error(error.message)
    }

    await admin.rpc('enqueue_initial_calendar_sync', { p_user: saved.user_id })
    return finish(req, saved.redirect_to, 'ok')
  } catch (err) {
    console.error('google/callback:', err instanceof Error ? err.message : 'unknown')
    return finish(req, saved.redirect_to, 'error')
  }
}
