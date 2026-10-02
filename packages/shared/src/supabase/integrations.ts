import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ExternalImportResult,
  ExternalTaskInput,
  Integration,
  TaskSource,
} from '../types/integration'
import { planExternalUpsert, type ExistingExternalTask } from '../utils/externalTasks'
import { createTasks } from './tasks'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any>

// secret_id ve sync_cursor istemciye açık değil (056 kolon izinleri): '*' seçmek hata verir.
const INTEGRATION_COLUMNS =
  'id, user_id, provider, account_label, status, settings, last_synced_at, last_error, created_at, updated_at'

export async function getIntegrations(supabase: Supabase, userId: string): Promise<Integration[]> {
  const { data, error } = await supabase
    .from('integrations')
    .select(INTEGRATION_COLUMNS)
    .eq('user_id', userId)
    .order('created_at')

  if (error) throw error
  return data as unknown as Integration[]
}

/** Bağlantıyı keser. Token Vault'tan tetikleyiciyle silinir; içe aktarılmış görevler kalır. */
export async function deleteIntegration(supabase: Supabase, integrationId: string): Promise<void> {
  const { error } = await supabase.from('integrations').delete().eq('id', integrationId)
  if (error) throw error
}

const IMPORT_CHUNK = 100

/**
 * Dış görevleri (user_id, source, external_id) ile upsert eder: yeni olan eklenir,
 * var olan güncellenir, LifeOS'ta tamamlanmış olana dokunulmaz. Aynı listeyi iki kez
 * aktarmak çift kayıt üretmez. Hem kullanıcı istemcisiyle hem service-role ile çalışır.
 */
export async function importExternalTasks(
  supabase: Supabase,
  userId: string,
  source: TaskSource,
  items: readonly ExternalTaskInput[],
): Promise<ExternalImportResult> {
  if (items.length === 0) return { created: 0, updated: 0, skipped: 0 }

  const existing: ExistingExternalTask[] = []
  const ids = [...new Set(items.map((i) => i.external_id))]
  for (let i = 0; i < ids.length; i += IMPORT_CHUNK) {
    const { data, error } = await supabase
      .from('tasks')
      .select('id, external_id, status')
      .eq('user_id', userId)
      .eq('source', source)
      .in('external_id', ids.slice(i, i + IMPORT_CHUNK))
    if (error) throw error
    existing.push(...(data as unknown as ExistingExternalTask[]))
  }

  const plan = planExternalUpsert(items, existing)

  for (const { id, patch } of plan.toUpdate) {
    const { error } = await supabase.from('tasks').update(patch).eq('id', id)
    if (error) throw error
  }

  if (plan.toInsert.length > 0) {
    for (let i = 0; i < plan.toInsert.length; i += IMPORT_CHUNK) {
      const chunk = plan.toInsert.slice(i, i + IMPORT_CHUNK)
      await createTasks(
        supabase,
        userId,
        chunk.map(({ external_id: _id, external_url: _url, external_updated_at: _at, ...input }) => input),
        chunk.map((item) => ({ source, external_id: item.external_id, external_url: item.external_url, external_updated_at: item.external_updated_at })),
      )
    }
  }

  return { created: plan.toInsert.length, updated: plan.toUpdate.length, skipped: plan.skipped }
}
