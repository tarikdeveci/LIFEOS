'use client'

import { createBrowserClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@lifeos/shared'

// @supabase/ssr kullanarak cookie-based session sağlarız (middleware görebilir)
// SupabaseClient<Database> tipine cast ediyoruz — runtime aynı nesne, sadece tip uyumu için
export const supabase = createBrowserClient<Database>(
  process.env['NEXT_PUBLIC_SUPABASE_URL']!,
  process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
) as unknown as ReturnType<typeof createClient<Database>>
