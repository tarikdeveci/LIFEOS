// integrations-sync: 15 dakikalık cron (058). Aktif Jira, Notion ve Microsoft To Do
// bağlantıları için kaynaktaki açık görev listesini çeker ve LifeOS'a yansıtır:
// yeni gelen backlog'a düşer, değişen güncellenir, kaynakta kapanan LifeOS'ta tamamlanır.
// Kaynağa geri yazma yok. Liste eksiksiz çekilemezse (sayfa sınırı, hata) hiçbir görev
// kapatılmaz: yarım listeyle kapatmak açık işi yanlışlıkla bitirir.

import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  type ExistingSynced, type JiraIssue, type MsTodoTask, type NotionMapping, type NotionPage,
  type SyncProvider, type SyncedTask,
  jiraToTask, msTodoToTask, notionFilter, notionToTask, planSync,
} from '../_shared/integrations/mappers.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const PROVIDERS: SyncProvider[] = ['jira', 'notion', 'microsoft_todo']
const MAX_INTEGRATIONS = 25
const MAX_PAGES = 5
const CHUNK = 100
const NOTION_VERSION = '2025-09-03'

interface IntegrationRow {
  id: string
  user_id: string
  provider: SyncProvider
  settings: Record<string, unknown> | null
}

interface Fetched {
  tasks: SyncedTask[]
  /** Listenin tamamı geldi mi (kapatma kararı buna bağlı). */
  complete: boolean
}

class RevokedError extends Error {}

async function readSecret(id: string): Promise<Record<string, string>> {
  const { data, error } = await supabase.rpc('integration_get_secret', { p_integration: id })
  if (error || typeof data !== 'string') throw new RevokedError('secret yok')
  return JSON.parse(data) as Record<string, string>
}

async function writeSecret(id: string, value: Record<string, string>): Promise<void> {
  const { error } = await supabase.rpc('integration_set_secret', { p_integration: id, p_secret: JSON.stringify(value) })
  if (error) throw new Error(`secret yazılamadı: ${error.message}`)
}

/** Dönüşümlü refresh token: yeni gelen hemen kaydedilir, eskisi bir daha çalışmaz. */
async function refresh(
  integration: IntegrationRow, url: string, init: RequestInit,
): Promise<string> {
  const res = await fetch(url, init)
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string }
  if (body.error === 'invalid_grant' || res.status === 401) throw new RevokedError(body.error ?? 'unauthorized')
  if (!res.ok || !body.access_token) throw new Error(`token yenilenemedi (${res.status})`)
  if (body.refresh_token) {
    const current = await readSecret(integration.id)
    await writeSecret(integration.id, { ...current, refresh_token: body.refresh_token, ...(integration.provider === 'notion' ? { access_token: body.access_token } : {}) })
  }
  return body.access_token
}

// ------------------------------------------------------------------ Jira

async function fetchJira(integration: IntegrationRow): Promise<Fetched> {
  const { refresh_token } = await readSecret(integration.id)
  if (!refresh_token) throw new RevokedError('refresh token yok')
  const token = await refresh(integration, 'https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: Deno.env.get('JIRA_CLIENT_ID'),
      client_secret: Deno.env.get('JIRA_CLIENT_SECRET'),
      refresh_token,
    }),
  })
  const auth = { Authorization: `Bearer ${token}`, Accept: 'application/json' }

  const sitesRes = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', { headers: auth })
  if (!sitesRes.ok) throw new Error(`jira siteleri ${sitesRes.status}`)
  const sites = (await sitesRes.json()) as { id: string; url: string }[]

  const tasks: SyncedTask[] = []
  let complete = true
  const jql = 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC'
  for (const site of sites) {
    let next: string | undefined
    let pages = 0
    do {
      const url = new URL(`https://api.atlassian.com/ex/jira/${site.id}/rest/api/3/search/jql`)
      url.searchParams.set('jql', jql)
      url.searchParams.set('fields', 'summary,duedate,priority,updated,project')
      url.searchParams.set('maxResults', '100')
      if (next) url.searchParams.set('nextPageToken', next)
      const res = await fetch(url, { headers: auth })
      if (!res.ok) throw new Error(`jira arama ${res.status}`)
      const body = (await res.json()) as { issues?: JiraIssue[]; nextPageToken?: string; isLast?: boolean }
      for (const issue of body.issues ?? []) {
        const task = jiraToTask(issue, site.url)
        if (task) tasks.push(task)
      }
      next = body.isLast === false ? body.nextPageToken : undefined
      pages++
    } while (next && pages < MAX_PAGES)
    if (next) complete = false
  }
  return { tasks, complete }
}

// ------------------------------------------------------------------ Microsoft To Do

async function fetchMsTodo(integration: IntegrationRow): Promise<Fetched> {
  const { refresh_token } = await readSecret(integration.id)
  if (!refresh_token) throw new RevokedError('refresh token yok')
  const token = await refresh(integration, 'https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('MICROSOFT_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('MICROSOFT_CLIENT_SECRET') ?? '',
      grant_type: 'refresh_token',
      refresh_token,
      scope: 'offline_access Tasks.Read User.Read',
    }),
  })
  const auth = { Authorization: `Bearer ${token}` }

  const listsRes = await fetch('https://graph.microsoft.com/v1.0/me/todo/lists', { headers: auth })
  if (!listsRes.ok) throw new Error(`todo listeleri ${listsRes.status}`)
  const lists = ((await listsRes.json()) as { value?: { id: string; displayName?: string }[] }).value ?? []

  const tasks: SyncedTask[] = []
  let complete = true
  for (const list of lists) {
    let next: string | undefined =
      `https://graph.microsoft.com/v1.0/me/todo/lists/${encodeURIComponent(list.id)}/tasks?$filter=${encodeURIComponent("status ne 'completed'")}&$top=100`
    let pages = 0
    while (next && pages < MAX_PAGES) {
      const res = await fetch(next, { headers: auth })
      if (!res.ok) throw new Error(`todo görevleri ${res.status}`)
      const body = (await res.json()) as { value?: MsTodoTask[]; '@odata.nextLink'?: string }
      for (const item of body.value ?? []) {
        const task = msTodoToTask(item, list.displayName ?? '')
        if (task) tasks.push(task)
      }
      next = body['@odata.nextLink']
      pages++
    }
    if (next) complete = false
  }
  return { tasks, complete }
}

// ------------------------------------------------------------------ Notion

async function notionFetch(integration: IntegrationRow, path: string, body: unknown): Promise<Response> {
  const secret = await readSecret(integration.id)
  const call = (token: string) => fetch(`https://api.notion.com/v1${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  let res = await call(secret.access_token ?? '')
  if (res.status !== 401) return res
  if (!secret.refresh_token) throw new RevokedError('notion 401')
  const basic = btoa(`${Deno.env.get('NOTION_CLIENT_ID') ?? ''}:${Deno.env.get('NOTION_CLIENT_SECRET') ?? ''}`)
  const token = await refresh(integration, 'https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: secret.refresh_token }),
  })
  res = await call(token)
  if (res.status === 401) throw new RevokedError('notion 401')
  return res
}

async function fetchNotion(integration: IntegrationRow): Promise<Fetched | null> {
  const settings = integration.settings ?? {}
  const dataSource = typeof settings['data_source_id'] === 'string' ? settings['data_source_id'] : null
  const mapping = settings['mapping'] as NotionMapping | undefined
  // Veritabanı henüz seçilmedi: senkron edilecek bir şey yok, hata da değil.
  if (!dataSource || !mapping?.title) return null
  const owner = typeof settings['owner_id'] === 'string' ? settings['owner_id'] : null

  const tasks: SyncedTask[] = []
  const filter = notionFilter(mapping, owner)
  let cursor: string | undefined
  let pages = 0
  do {
    const res = await notionFetch(integration, `/data_sources/${encodeURIComponent(dataSource)}/query`, {
      page_size: 100,
      ...(filter ? { filter } : {}),
      ...(cursor ? { start_cursor: cursor } : {}),
    })
    if (!res.ok) throw new Error(`notion sorgu ${res.status}`)
    const body = (await res.json()) as { results?: NotionPage[]; next_cursor?: string | null; has_more?: boolean }
    for (const page of body.results ?? []) {
      const task = notionToTask(page, mapping)
      if (task) tasks.push(task)
    }
    cursor = body.has_more ? body.next_cursor ?? undefined : undefined
    pages++
  } while (cursor && pages < MAX_PAGES)
  return { tasks, complete: !cursor }
}

// ------------------------------------------------------------------ Uygulama

async function apply(integration: IntegrationRow, fetched: Fetched): Promise<{ created: number; updated: number; closed: number }> {
  const existing: ExistingSynced[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('tasks')
      .select('id, external_id, status')
      .eq('user_id', integration.user_id)
      .eq('source', integration.provider)
      .not('external_id', 'is', null)
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    existing.push(...(data as ExistingSynced[]))
    if (!data || data.length < 1000) break
    from += 1000
  }

  const plan = planSync(fetched.tasks, existing)

  for (let i = 0; i < plan.toInsert.length; i += CHUNK) {
    const rows = plan.toInsert.slice(i, i + CHUNK).map((t) => ({
      user_id: integration.user_id,
      title: t.title,
      description: t.description,
      due_date: t.due_date,
      urgency_score: t.urgency_score,
      tags: t.tags,
      status: 'backlog',
      source: integration.provider,
      external_id: t.external_id,
      external_url: t.external_url,
      external_updated_at: t.external_updated_at,
    }))
    const { data, error } = await supabase.from('tasks').insert(rows).select('id')
    if (error) throw new Error(error.message)
    const ids = ((data ?? []) as { id: string }[]).map((r) => ({ task_id: r.id }))
    if (ids.length > 0) await supabase.from('task_details').insert(ids)
  }

  for (const { id, task } of plan.toUpdate) {
    // Kaynağın sahip olduğu alanlar; WSJF puanları, planlanan gün ve notlar LifeOS'ta kalır.
    const { error } = await supabase.from('tasks').update({
      title: task.title,
      due_date: task.due_date,
      external_url: task.external_url,
      external_updated_at: task.external_updated_at,
      ...(task.description ? { description: task.description } : {}),
    }).eq('id', id)
    if (error) throw new Error(error.message)
  }

  let closed = 0
  if (fetched.complete && plan.toClose.length > 0) {
    const now = new Date().toISOString()
    for (let i = 0; i < plan.toClose.length; i += CHUNK) {
      const { error } = await supabase.from('tasks')
        .update({ status: 'done', completed_at: now })
        .in('id', plan.toClose.slice(i, i + CHUNK))
      if (error) throw new Error(error.message)
    }
    closed = plan.toClose.length
  }
  return { created: plan.toInsert.length, updated: plan.toUpdate.length, closed }
}

async function syncOne(integration: IntegrationRow) {
  const fetched = integration.provider === 'jira' ? await fetchJira(integration)
    : integration.provider === 'microsoft_todo' ? await fetchMsTodo(integration)
      : await fetchNotion(integration)
  if (!fetched) return null
  return await apply(integration, fetched)
}

Deno.serve(async () => {
  const { data, error } = await supabase
    .from('integrations')
    .select('id, user_id, provider, settings')
    .in('provider', PROVIDERS)
    .eq('status', 'active')
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(MAX_INTEGRATIONS)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  let synced = 0
  let failed = 0
  for (const integration of (data ?? []) as IntegrationRow[]) {
    try {
      await syncOne(integration)
      await supabase.from('integrations')
        .update({ last_synced_at: new Date().toISOString(), last_error: null })
        .eq('id', integration.id)
      synced++
    } catch (err) {
      failed++
      const message = err instanceof Error ? err.message.slice(0, 500) : 'bilinmeyen hata'
      // Geçici hatada durum active kalır (bir sonraki turda tekrar denenir); iptal edilmiş
      // yetkide revoked olur ve kullanıcı ayarlarda yeniden bağlanır.
      await supabase.from('integrations')
        .update({
          last_error: message,
          last_synced_at: new Date().toISOString(),
          ...(err instanceof RevokedError ? { status: 'revoked' } : {}),
        })
        .eq('id', integration.id)
      console.error('integrations-sync:', integration.provider, message)
    }
  }
  return Response.json({ synced, failed })
})
