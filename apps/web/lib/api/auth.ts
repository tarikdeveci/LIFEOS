import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'

/**
 * API rotaları için oturum: web çerezden, mobil "Authorization: Bearer <supabase erişim
 * anahtarı>" ile gelir. Dönen istemci kullanıcı adına çalışır (RLS geçerli).
 */
export async function authenticateRequest(req: Request) {
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1]?.trim()
  const supabase = bearer
    ? createClient(process.env['NEXT_PUBLIC_SUPABASE_URL']!, process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : await createServerClient()
  const { data: { user } } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser()
  return user ? { supabase, userId: user.id } : null
}
