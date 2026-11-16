import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

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

