// Dış kaynak (Jira, Notion, Microsoft To Do) kayıtlarını LifeOS görevine çeviren saf
// fonksiyonlar ve senkron planı. Deno API'si kullanmaz: tests/ altından Node ile test edilir.
// Aynı upsert kuralı packages/shared/src/utils/externalTasks.ts içinde de var (içe aktarma);
// edge function'lar o paketi içe aktaramadığı için burada tekrar edilir.

export type SyncProvider = 'jira' | 'notion' | 'microsoft_todo'

export interface SyncedTask {
  external_id: string
  title: string
  description: string | null
  due_date: string | null
  urgency_score: number
  external_url: string | null
  external_updated_at: string | null
  tags: string[]
}

export interface ExistingSynced {
  id: string
  external_id: string
  status: string
  /** Görevi en son getiren bağlantı (063). NULL: bırakılmış kaynak ya da Inbox API. */
  integration_id: string | null
}

export interface SyncPlan {
  toInsert: SyncedTask[]
  toUpdate: { id: string; task: SyncedTask }[]
  /** Kaynakta artık açık değil (kapandı, atama kalktı, silindi): LifeOS'ta tamamlanır. */
  toClose: string[]
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function cleanTitle(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, 500)
}

function day(value: string | null | undefined): string | null {
  const d = (value ?? '').slice(0, 10)
  return DATE_RE.test(d) ? d : null
}

/**
 * Senkron planı. `incoming` kaynağın o anki açık listesinin TAMAMI olmalı: listede
 * olmayan açık görev kapatılır. LifeOS'ta tamamlanmış göreve dokunulmaz, yeniden de açılmaz.
 * Yalnızca bu bağlantının getirdiği görev kapatılır: `existing` aynı sağlayıcının başka
 * bağlantılarını da içerir ve onların görevi bu listede doğal olarak yoktur.
 */
export function planSync(
  incoming: readonly SyncedTask[], existing: readonly ExistingSynced[], integrationId: string,
): SyncPlan {
  const latest = new Map<string, SyncedTask>()
  for (const item of incoming) latest.set(item.external_id, item)
  const byExternal = new Map(existing.map((e) => [e.external_id, e]))

  const plan: SyncPlan = { toInsert: [], toUpdate: [], toClose: [] }
  for (const item of latest.values()) {
    const found = byExternal.get(item.external_id)
    if (!found) plan.toInsert.push(item)
    else if (found.status !== 'done') plan.toUpdate.push({ id: found.id, task: item })
  }
  for (const e of existing) {
    if (e.status !== 'done' && e.integration_id === integrationId && !latest.has(e.external_id)) plan.toClose.push(e.id)
  }
  return plan
}

// ------------------------------------------------------------------ Jira

export interface JiraIssue {
  id: string
  key: string
  fields: {
    summary?: string | null
    duedate?: string | null
    updated?: string | null
    priority?: { name?: string | null } | null
    project?: { key?: string | null } | null
  }
}

const JIRA_URGENCY: Record<string, number> = { highest: 5, high: 4, medium: 3, low: 2, lowest: 1 }

/** `siteUrl` accessible-resources'tan gelen site adresi (https://x.atlassian.net). */
export function jiraToTask(issue: JiraIssue, siteUrl: string): SyncedTask | null {
  const summary = cleanTitle(issue.fields.summary)
  if (!issue.id || !summary) return null
  const priority = (issue.fields.priority?.name ?? '').toLowerCase()
  const project = issue.fields.project?.key
  return {
    // Site kimliği de katılır: aynı kullanıcı iki Jira sitesine bağlıysa id'ler çakışmasın.
    external_id: `${new URL(siteUrl).host}:${issue.id}`,
    title: `${issue.key} ${summary}`.slice(0, 500),
    description: null,
    due_date: day(issue.fields.duedate),
    urgency_score: JIRA_URGENCY[priority] ?? 3,
    external_url: `${siteUrl.replace(/\/$/, '')}/browse/${issue.key}`,
    external_updated_at: issue.fields.updated ?? null,
    tags: ['jira', ...(project ? [project.toLowerCase()] : [])],
  }
}

// ------------------------------------------------------------------ Microsoft To Do

export interface MsTodoTask {
  id: string
  title?: string | null
  status?: string | null
  importance?: 'low' | 'normal' | 'high' | null
  dueDateTime?: { dateTime?: string | null } | null
  body?: { content?: string | null; contentType?: string | null } | null
  lastModifiedDateTime?: string | null
}

const MS_URGENCY: Record<string, number> = { high: 5, normal: 3, low: 2 }

export function msTodoToTask(task: MsTodoTask, listName: string): SyncedTask | null {
  const title = cleanTitle(task.title)
  if (!task.id || !title || task.status === 'completed') return null
  // HTML gövde düz metne indirgenmez; sadece düz metin notlar taşınır.
  const note = task.body?.contentType === 'text' ? (task.body.content ?? '').trim() : ''
  return {
    external_id: task.id,
    title,
    description: note ? note.slice(0, 5000) : null,
    // Graph dueDateTime'ı kullanıcının gününün gece yarısı olarak verir; gün kısmı yeterli.
    due_date: day(task.dueDateTime?.dateTime),
    urgency_score: MS_URGENCY[task.importance ?? 'normal'] ?? 3,
    external_url: 'https://to-do.office.com/tasks/',
    external_updated_at: task.lastModifiedDateTime ?? null,
    tags: ['microsoft todo', ...(listName ? [listName.toLowerCase().slice(0, 40)] : [])],
  }
}

// ------------------------------------------------------------------ Notion

/** Veri kaynağı seçilince şemadan çıkarılan eşleme (packages/shared/src/utils/notionMapping.ts). */
export interface NotionMapping {
  title: string
  people?: string
  status?: { name: string; type: 'status' | 'checkbox' | 'select' }
  date?: string
}

/** Sorgu filtresi: tamamlanmamış ve (kişi özelliği varsa) kullanıcıya atanmış sayfalar. */
export function notionFilter(mapping: NotionMapping, ownerId: string | null): Record<string, unknown> | undefined {
  const parts: Record<string, unknown>[] = []
  if (mapping.status?.type === 'status') parts.push({ property: mapping.status.name, status: { does_not_equal: 'Complete' } })
  if (mapping.status?.type === 'checkbox') parts.push({ property: mapping.status.name, checkbox: { equals: false } })
  if (mapping.people && ownerId) parts.push({ property: mapping.people, people: { contains: ownerId } })
  if (parts.length === 0) return undefined
  return parts.length === 1 ? parts[0] : { and: parts }
}

interface NotionRichText { plain_text?: string }
export interface NotionPage {
  id: string
  url?: string
  last_edited_time?: string
  in_trash?: boolean
  archived?: boolean
  properties: Record<string, {
    type: string
    title?: NotionRichText[]
    date?: { start?: string | null } | null
  }>
}

export function notionToTask(page: NotionPage, mapping: NotionMapping): SyncedTask | null {
  if (page.in_trash || page.archived) return null
  const titleProp = page.properties[mapping.title]
  const title = cleanTitle((titleProp?.title ?? []).map((t) => t.plain_text ?? '').join(''))
  if (!page.id || !title) return null
  const dateProp = mapping.date ? page.properties[mapping.date] : undefined
  return {
    external_id: page.id,
    title,
    description: null,
    due_date: day(dateProp?.date?.start),
    urgency_score: 3,
    external_url: page.url ?? null,
    external_updated_at: page.last_edited_time ?? null,
    tags: ['notion'],
  }
}
