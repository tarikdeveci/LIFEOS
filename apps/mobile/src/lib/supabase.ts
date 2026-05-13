import * as SecureStore from 'expo-secure-store'
import { createMobileClient } from '@lifeos/shared/supabase'

// SecureStore adapter — Supabase tokenlarını güvenli şekilde saklar
const secureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

export const supabase = createMobileClient(secureStoreAdapter)
