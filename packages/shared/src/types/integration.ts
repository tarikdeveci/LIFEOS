// Entegrasyon ve dış kaynak tipleri
// Şema: supabase/migrations/056_integrations.sql

import type { CreateTaskInput } from './task'

export type IntegrationProvider =
  | 'google_calendar' | 'jira' | 'slack' | 'notion' | 'todoist' | 'ticktick' | 'microsoft_todo'

export type IntegrationStatus = 'active' | 'error' | 'revoked'

/** İstemcinin görebildiği kolonlar; secret_id ve sync_cursor sunucuda kalır. */
export interface Integration {
  id: string
  user_id: string
  provider: IntegrationProvider
  account_label: string
  status: IntegrationStatus
  settings: Record<string, unknown>
  last_synced_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

/** Görevlerin geldiği yer. Bağlı hesap gerektirmeyen tek seferlik kaynaklar da burada. */
export type TaskSource = 'api' | 'todoist' | 'ticktick' | 'apple_reminders' | 'microsoft_todo' | 'jira' | 'slack' | 'notion'

/** Dış kaynaktan gelen görev: external_id ile upsert edilir. */
export type ExternalTaskInput = CreateTaskInput & {
  external_id: string
  external_url?: string
  external_updated_at?: string
}

export interface ExternalImportResult {
  created: number
  updated: number
  /** Zaten var ve LifeOS'ta tamamlanmış: dokunulmadı. */
  skipped: number
}
