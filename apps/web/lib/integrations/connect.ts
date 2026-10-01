import { createAdminClient } from '@/lib/supabase/admin'
import { GOOGLE_CAL_API, GOOGLE_TOKEN_URL, googleCredentials, googleRedirectUri } from './google'
import { callbackUri } from './oauth'
import { providerCredentials, type OAuthProvider } from './providers'
import type { ConnectResult } from './handoff'

/**
 * Kodu token'a çevirip bağlantıyı yazan adımlar. Web'de callback, mobilde /complete çağırır;
 * ikisi de aynı redirect_uri'yi kullanır (token isteğinde yetki isteğiyle birebir aynı olmalı).
 */

/** Jira / Notion / Microsoft To Do / Slack: bağlantıyı yazar, token'ı Vault'a koyar. */
export async function connectProvider(req: Request, slug: string, provider: OAuthProvider, userId: string, verifier: string, code: string): Promise<ConnectResult> {
  const creds = providerCredentials(provider)
  if (!creds) throw new Error('credentials')
  const admin = createAdminClient()
  const connected = await provider.exchange({ code, redirectUri: callbackUri(req, slug), verifier, creds })

  if (provider.provider === 'slack') {
    // Bir Slack kullanıcısı tek LifeOS hesabına bağlanır: komut kime yazılacağı belli olsun.
    await admin.from('integrations').delete()
      .eq('provider', 'slack')
      .eq('settings->>team_id', String(connected.settings['team_id']))
      .eq('settings->>slack_user_id', String(connected.settings['slack_user_id']))
      .neq('user_id', userId)
  }

  // Yeniden bağlanınca önceki seçimler (Notion veritabanı gibi) korunur.
  const { data: previous } = await admin
    .from('integrations')
    .select('settings')
    .eq('user_id', userId)
    .eq('provider', provider.provider)
    .eq('account_label', connected.accountLabel)
    .maybeSingle()
  const settings = { ...((previous as { settings?: Record<string, unknown> } | null)?.settings ?? {}), ...connected.settings }

  const { data: integration, error } = await admin
    .from('integrations')
    .upsert(
      { user_id: userId, provider: provider.provider, account_label: connected.accountLabel, status: 'active', last_error: null, settings },
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
  return 'ok'
}

/**
 * Google Takvim: refresh token'ı Vault'a yazar, "LifeOS" takvimini açar (yoksa) ve mevcut
 * blokları ilk senkron için kuyruğa alır.
 */
export async function connectGoogle(req: Request, userId: string, verifier: string, code: string): Promise<ConnectResult> {
  const creds = googleCredentials()
  if (!creds) throw new Error('credentials')
  const admin = createAdminClient()
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: googleRedirectUri(req),
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  })
  const tokens = (await tokenRes.json()) as { access_token?: string; refresh_token?: string; scope?: string }
  if (!tokenRes.ok || !tokens.access_token) throw new Error(`token ${tokenRes.status}`)
  // Kullanıcı onay ekranında dolu/boş iznini kaldırabilir; takvimsiz bağlantı işe yaramaz.
  if (!tokens.scope?.includes('calendar.app.created')) return 'denied'

  const { data: integration, error: upsertError } = await admin
    .from('integrations')
    .upsert(
      { user_id: userId, provider: 'google_calendar', account_label: '', status: 'active', last_error: null },
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
    const { data: prefs } = await admin.from('notification_preferences').select('timezone').eq('user_id', userId).maybeSingle()
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

  await admin.rpc('enqueue_initial_calendar_sync', { p_user: userId })
  return 'ok'
}
