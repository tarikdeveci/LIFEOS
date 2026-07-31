import { createClient } from '@supabase/supabase-js'

// Service-role Supabase client — RLS'i bypass eder.
// SADECE sunucu tarafında (API route'lar, webhooks) kullan. Asla istemciye sızdırma.
// NEXT_PUBLIC_SUPABASE_URL zaten public; asıl gizli olan SUPABASE_SERVICE_ROLE_KEY.
export function createAdminClient() {
  return createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
