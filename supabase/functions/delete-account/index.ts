import { createClient } from 'npm:@supabase/supabase-js@2'

const ALLOWED_ORIGINS = ['http://localhost:3000', 'http://localhost:3001', 'https://lifeos.tr', 'https://www.lifeos.tr']

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]!,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }
}

/**
 * Bağlı hesapların token'larını sağlayıcıda iptal eder. En iyi çaba: bir sağlayıcı
 * yanıt vermezse hesap silme yine sürer. Vault kayıtları, satırlar kaskadla silinince
 * 056'daki tetikleyiciyle gider.
 */
// deno-lint-ignore no-explicit-any
async function revokeIntegrations(admin: any, userId: string): Promise<void> {
  const { data: rows } = await admin.from('integrations').select('id, provider').eq('user_id', userId)
  for (const row of (rows ?? []) as Array<{ id: string; provider: string }>) {
    try {
      const { data: token } = await admin.rpc('integration_get_secret', { p_integration: row.id })
      if (typeof token !== 'string' || !token) continue
      // Saklanan değer JSON ({ refresh_token, access_token }) ya da düz token olabilir.
      let value = token
      try {
        const parsed = JSON.parse(token) as { refresh_token?: string; access_token?: string }
        value = parsed.refresh_token ?? parsed.access_token ?? token
      } catch { /* düz token */ }
      if (row.provider === 'google_calendar') {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(value)}`, { method: 'POST' })
      }
      // Jira, Notion ve Microsoft'ta sunucudan çağrılacak iptal ucu yok (kullanıcı hesabından
      // kaldırır); Slack token saklanmıyor. Hepsinin Vault kaydı satırla birlikte silinir (056).
    } catch (err) {
      console.error('delete-account: token iptali başarısız', row.provider, err instanceof Error ? err.message : 'unknown')
    }
  }
}

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })

  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization) return new Response(JSON.stringify({ error: 'Oturum gerekli' }), { status: 401, headers })

    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } },
    })
    const { data: { user }, error: userError } = await authClient.auth.getUser()
    if (userError || !user) return new Response(JSON.stringify({ error: 'Geçersiz oturum' }), { status: 401, headers })

    const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    await revokeIntegrations(adminClient, user.id)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id)
    if (deleteError) throw deleteError

    return new Response(JSON.stringify({ deleted: true }), { status: 200, headers })
  } catch (error: unknown) {
    console.error('delete-account error:', error)
    return new Response(JSON.stringify({ error: 'Hesap silinemedi' }), { status: 500, headers })
  }
})
