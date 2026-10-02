import type { IntegrationProvider } from '@lifeos/shared/types'

/**
 * OAuth ile bağlanan görev kaynakları (Google Calendar ayrı: lib/integrations/google.ts).
 * Her sağlayıcı: yetki adresi, kod değişimi ve bağlanınca yazılacaklar. Token'lar
 * Vault'a gider; senkron supabase/functions/integrations-sync içinde.
 * Slack token saklamaz: komut ve kısayol istekleri imzayla doğrulanır.
 */

export type ProviderSlug = 'jira' | 'notion' | 'microsoft' | 'slack'

export interface Connected {
  accountLabel: string
  settings: Record<string, unknown>
  /** Vault'a yazılacak token'lar; null ise saklanacak token yok. */
  secret: Record<string, string> | null
}

interface Credentials { clientId: string; clientSecret: string }

export interface OAuthProvider {
  provider: IntegrationProvider
  env: { id: string; secret: string }
  pkce: boolean
  authorizeUrl(args: { clientId: string; redirectUri: string; state: string; challenge: string }): string
  exchange(args: { code: string; redirectUri: string; verifier: string; creds: Credentials }): Promise<Connected>
}

async function json<T>(res: Response, label: string): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: unknown }
  if (!res.ok) throw new Error(`${label} ${res.status}`)
  return body
}

const jira: OAuthProvider = {
  provider: 'jira',
  env: { id: 'JIRA_CLIENT_ID', secret: 'JIRA_CLIENT_SECRET' },
  pkce: false,
  authorizeUrl({ clientId, redirectUri, state }) {
    const url = new URL('https://auth.atlassian.com/authorize')
    url.searchParams.set('audience', 'api.atlassian.com')
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('scope', 'read:jira-work read:jira-user offline_access')
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('state', state)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('prompt', 'consent')
    return url.toString()
  },
  async exchange({ code, redirectUri, creds }) {
    const tokens = await json<{ access_token?: string; refresh_token?: string }>(
      await fetch('https://auth.atlassian.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code', client_id: creds.clientId, client_secret: creds.clientSecret,
          code, redirect_uri: redirectUri,
        }),
      }),
      'jira token',
    )
    if (!tokens.access_token || !tokens.refresh_token) throw new Error('jira token eksik')
    const sites = await json<{ id: string; name: string; url: string }[]>(
      await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
        headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' },
      }),
      'jira siteleri',
    )
    if (sites.length === 0) throw new Error('erişilebilir Jira sitesi yok')
    return {
      accountLabel: sites.map((s) => s.name).join(', ').slice(0, 200),
      settings: { sites: sites.map((s) => s.url) },
      secret: { refresh_token: tokens.refresh_token },
    }
  },
}

const notion: OAuthProvider = {
  provider: 'notion',
  env: { id: 'NOTION_CLIENT_ID', secret: 'NOTION_CLIENT_SECRET' },
  pkce: false,
  authorizeUrl({ clientId, redirectUri, state }) {
    const url = new URL('https://api.notion.com/v1/oauth/authorize')
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('owner', 'user')
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('state', state)
    return url.toString()
  },
  async exchange({ code, redirectUri, creds }) {
    const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')
    const tokens = await json<{
      access_token?: string; refresh_token?: string | null; workspace_name?: string | null
      workspace_id?: string; owner?: { user?: { id?: string } }
    }>(
      await fetch('https://api.notion.com/v1/oauth/token', {
        method: 'POST',
        headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
      }),
      'notion token',
    )
    if (!tokens.access_token) throw new Error('notion token eksik')
    return {
      accountLabel: (tokens.workspace_name ?? 'Notion').slice(0, 200),
      settings: { workspace_id: tokens.workspace_id ?? null, owner_id: tokens.owner?.user?.id ?? null },
      secret: { access_token: tokens.access_token, ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}) },
    }
  },
}

const MS_SCOPES = 'offline_access Tasks.Read User.Read'

const microsoft: OAuthProvider = {
  provider: 'microsoft_todo',
  env: { id: 'MICROSOFT_CLIENT_ID', secret: 'MICROSOFT_CLIENT_SECRET' },
  pkce: true,
  authorizeUrl({ clientId, redirectUri, state, challenge }) {
    const url = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('response_mode', 'query')
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('scope', MS_SCOPES)
    url.searchParams.set('state', state)
    url.searchParams.set('code_challenge', challenge)
    url.searchParams.set('code_challenge_method', 'S256')
    return url.toString()
  },
  async exchange({ code, redirectUri, verifier, creds }) {
    const tokens = await json<{ access_token?: string; refresh_token?: string }>(
      await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: creds.clientId, client_secret: creds.clientSecret, grant_type: 'authorization_code',
          code, redirect_uri: redirectUri, code_verifier: verifier, scope: MS_SCOPES,
        }),
      }),
      'microsoft token',
    )
    if (!tokens.access_token || !tokens.refresh_token) throw new Error('microsoft token eksik')
    const me = await json<{ mail?: string | null; userPrincipalName?: string | null }>(
      await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }),
      'microsoft profil',
    )
    return {
      accountLabel: (me.mail ?? me.userPrincipalName ?? 'Microsoft').slice(0, 200),
      settings: {},
      secret: { refresh_token: tokens.refresh_token },
    }
  },
}

const slack: OAuthProvider = {
  provider: 'slack',
  env: { id: 'SLACK_CLIENT_ID', secret: 'SLACK_CLIENT_SECRET' },
  pkce: false,
  authorizeUrl({ clientId, redirectUri, state }) {
    const url = new URL('https://slack.com/oauth/v2/authorize')
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('scope', 'commands')
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('state', state)
    return url.toString()
  },
  async exchange({ code, redirectUri, creds }) {
    const body = await json<{
      ok?: boolean; error?: string; team?: { id?: string; name?: string }; authed_user?: { id?: string }
    }>(
      await fetch('https://slack.com/api/oauth.v2.access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: creds.clientId, client_secret: creds.clientSecret, code, redirect_uri: redirectUri }),
      }),
      'slack token',
    )
    if (!body.ok || !body.team?.id || !body.authed_user?.id) throw new Error(`slack ${body.error ?? 'eksik yanıt'}`)
    return {
      accountLabel: (body.team.name ?? 'Slack').slice(0, 200),
      settings: { team_id: body.team.id, slack_user_id: body.authed_user.id },
      secret: null,
    }
  },
}

export const OAUTH_PROVIDERS: Record<ProviderSlug, OAuthProvider> = { jira, notion, microsoft, slack }

export function providerBySlug(slug: string): OAuthProvider | null {
  return Object.prototype.hasOwnProperty.call(OAUTH_PROVIDERS, slug) ? OAUTH_PROVIDERS[slug as ProviderSlug] : null
}

export function providerCredentials(p: OAuthProvider): Credentials | null {
  const clientId = process.env[p.env.id]
  const clientSecret = process.env[p.env.secret]
  return clientId && clientSecret ? { clientId, clientSecret } : null
}
