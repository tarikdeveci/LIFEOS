import { createServerClient as createSSRClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from '@lifeos/shared'

// @supabase/ssr ve @supabase/supabase-js aynı runtime nesnesini döndürür —
// sadece TypeScript tip imzaları farklı, bu yüzden cast kullanıyoruz
type ServerClient = ReturnType<typeof createClient<Database>>

// Server Components ve Route Handlers için Supabase client
export async function createServerClient(): Promise<ServerClient> {
  const cookieStore = await cookies()

  const client = createSSRClient<Database>(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        },
      },
    },
  )

  return client as unknown as ServerClient
}
