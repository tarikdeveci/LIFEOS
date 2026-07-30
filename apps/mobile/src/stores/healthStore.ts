import { create } from 'zustand'
import {
  todayDate,
  shiftIsoDate,
  DEFAULT_HEALTH_SETTINGS,
  type HealthDaily,
  type HealthSettings,
  type HealthSettingsUpdate,
} from '@lifeos/shared'
// supabase/* kök barrel'dan re-export edilmiyor (döngüsel bağımlılık) — doğrudan al
import {
  getHealthRange,
  getHealthSettings,
  updateHealthSettings,
  upsertHealthDaily,
} from '@lifeos/shared/supabase'
import { supabase } from '@/src/lib/supabase'
import {
  isHealthAvailable,
  requestHealthPermissions,
  readHealthDay,
} from '@/src/utils/health'

interface HealthStore {
  available: boolean | null
  settings: HealthSettings | null
  today: HealthDaily | null
  range: HealthDaily[]
  isSyncing: boolean
  isConnecting: boolean
  lastError: string | null

  /** Ayarları + son verileri yükler (uygulama açılışında, izin istemeden) */
  hydrate: (userId: string) => Promise<void>
  /** İzin ister, açar ve ilk senkronu yapar */
  connect: (userId: string) => Promise<boolean>
  /** Bugünü cihazdan okuyup DB'ye yazar ve state'i tazeler */
  sync: (userId: string) => Promise<void>
  updateSettings: (userId: string, updates: HealthSettingsUpdate) => Promise<void>
  reset: () => void
}

// Cihazdan çekilecek gün sayısı — dinlenme nabzı taban çizgisi ve haftalık trend
const RANGE_DAYS = 7

export const useHealthStore = create<HealthStore>((set, get) => ({
  available: null,
  settings: null,
  today: null,
  range: [],
  isSyncing: false,
  isConnecting: false,
  lastError: null,

  hydrate: async (userId) => {
    try {
      const available = await isHealthAvailable()
      set({ available })

      const settings = await getHealthSettings(supabase, userId)
      set({ settings })

      const range = await getHealthRange(supabase, userId, RANGE_DAYS)
      const today = range.find((d) => d.date === todayDate()) ?? null
      set({ range, today })

      // Bağlıysa ve son senkron eskiyse arka planda tazele
      if (settings.enabled && available && shouldAutoSync(settings.last_synced_at)) {
        void get().sync(userId)
      }
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : 'hydrate failed' })
    }
  },

  connect: async (userId) => {
    set({ isConnecting: true, lastError: null })
    try {
      const available = await isHealthAvailable()
      set({ available })
      if (!available) {
        set({ isConnecting: false })
        return false
      }

      const granted = await requestHealthPermissions()
      if (!granted) {
        set({ isConnecting: false })
        return false
      }

      await get().updateSettings(userId, { enabled: true })
      await get().sync(userId)
      set({ isConnecting: false })
      return true
    } catch (err) {
      set({ isConnecting: false, lastError: err instanceof Error ? err.message : 'connect failed' })
      return false
    }
  },

  sync: async (userId) => {
    if (get().isSyncing) return
    set({ isSyncing: true, lastError: null })

    try {
      const today = todayDate()
      // Bugün + dün: gece gelen adım/uyku bir önceki güne düşebiliyor
      const dates = [shiftIsoDate(today, -1), today]

      for (const date of dates) {
        const result = await readHealthDay(date)
        if (result.ok) {
          await upsertHealthDaily(supabase, userId, result.metrics)
        }
      }

      const range = await getHealthRange(supabase, userId, RANGE_DAYS)
      const todayRow = range.find((d) => d.date === today) ?? null
      set({ range, today: todayRow })

      await get().updateSettings(userId, { last_synced_at: new Date().toISOString() })
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : 'sync failed' })
    } finally {
      set({ isSyncing: false })
    }
  },

  updateSettings: async (userId, updates) => {
    // Optimistic — ayar anahtarları anında yansısın
    const prev = get().settings
    set({
      settings: {
        ...(prev ?? { user_id: userId, ...DEFAULT_HEALTH_SETTINGS, last_synced_at: null, created_at: '', updated_at: '' }),
        ...updates,
      } as HealthSettings,
    })
    try {
      const saved = await updateHealthSettings(supabase, userId, updates)
      set({ settings: saved })
    } catch (err) {
      set({ settings: prev, lastError: err instanceof Error ? err.message : 'settings failed' })
      throw err
    }
  },

  reset: () => set({ available: null, settings: null, today: null, range: [], isSyncing: false, isConnecting: false, lastError: null }),
}))

/** Son senkrondan 30dk geçtiyse otomatik tazele */
function shouldAutoSync(lastSyncedAt: string | null): boolean {
  if (!lastSyncedAt) return true
  const elapsed = Date.now() - new Date(lastSyncedAt).getTime()
  return elapsed > 30 * 60 * 1000
}
