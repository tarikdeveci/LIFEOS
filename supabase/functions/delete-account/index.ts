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
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id)
    if (deleteError) throw deleteError

    return new Response(JSON.stringify({ deleted: true }), { status: 200, headers })
  } catch (error: unknown) {
    console.error('delete-account error:', error)
    return new Response(JSON.stringify({ error: 'Hesap silinemedi' }), { status: 500, headers })
  }
})
