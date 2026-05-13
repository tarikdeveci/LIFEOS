import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

// Web için browser client (singleton)
let webClient: SupabaseClient<Database> | null = null

export function createBrowserClient(): SupabaseClient<Database> {
  if (webClient) return webClient

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const key = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']

  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_ANON_KEY eksik')
  }

  webClient = createClient<Database>(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  })

  return webClient
}

type StorageAdapter = {
  getItem(key: string): string | null | Promise<string | null>
  setItem(key: string, value: string): void | Promise<void>
  removeItem(key: string): void | Promise<void>
}

// Mobil için client (Expo SecureStore ile token storage)
// Storage adapter'ı Expo app içinde inject edilir
export function createMobileClient(storage: StorageAdapter): SupabaseClient<Database> {
  const url = process.env['EXPO_PUBLIC_SUPABASE_URL']
  const key = process.env['EXPO_PUBLIC_SUPABASE_ANON_KEY']

  if (!url || !key) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_ANON_KEY eksik')
  }

  return createClient<Database>(url, key, {
    auth: {
      storage,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })
}

// Server-side için (Next.js Server Components / Route Handlers)
export function createServerClient(
  supabaseUrl: string,
  supabaseKey: string,
): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, supabaseKey)
}
