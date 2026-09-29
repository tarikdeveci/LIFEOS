import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { todoistToExternal } from '@lifeos/shared/utils'
import type { ExternalTaskInput } from '@lifeos/shared/types'
import type { TodoistTask } from '@lifeos/shared/utils'
import { importExternalTasks } from '@lifeos/shared/supabase'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const TODOIST_TASKS_URL = 'https://api.todoist.com/api/v1/tasks'
const PAGE_LIMIT = 200
const MAX_TASKS = 1000
const TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

/**
 * Oturum: web çerezden, mobil "Authorization: Bearer <supabase erişim anahtarı>" ile.
 * Dönen istemci kullanıcı adına çalışır, RLS geçerli.
 */
async function authenticate(req: Request) {
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1]?.trim()
  const supabase = bearer
    ? createClient(process.env['NEXT_PUBLIC_SUPABASE_URL']!, process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : await createServerClient()
  const { data: { user } } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser()
  return user ? { supabase, userId: user.id } : null
}

/** Todoist'teki açık görevleri sayfa sayfa okur. Token sadece bu istekte kullanılır. */
async function fetchTodoistTasks(token: string): Promise<TodoistTask[] | 'unauthorized'> {
  const tasks: TodoistTask[] = []
  let cursor: string | null = null
  do {
    const url = new URL(TODOIST_TASKS_URL)
    url.searchParams.set('limit', String(PAGE_LIMIT))
    if (cursor) url.searchParams.set('cursor', cursor)
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
    if (res.status === 401 || res.status === 403) return 'unauthorized'
    if (!res.ok) throw new Error(`todoist ${res.status}`)
    const page = (await res.json()) as { results?: TodoistTask[]; next_cursor?: string | null }
    tasks.push(...(page.results ?? []))
    cursor = page.next_cursor ?? null
  } while (cursor && tasks.length < MAX_TASKS)
  return tasks.slice(0, MAX_TASKS)
}

/**
 * Todoist'ten tek seferlik içe aktarma. Kullanıcı Todoist API token'ını yapıştırır;
 * sunucu açık görevleri okur ve (source='todoist', external_id) ile upsert eder.
 * Token saklanmaz, loglanmaz. Tekrar çalıştırmak çift kayıt üretmez.
 *
 * Body: { "token": "<todoist api token>" }
 */
export async function POST(req: Request) {
  const auth = await authenticate(req)
  if (!auth) return jsonError('Oturum gerekli', 401)

  let body: unknown
  try { body = await req.json() } catch { return jsonError('Geçersiz JSON gövdesi', 400) }
  const token = typeof (body as { token?: unknown })?.token === 'string' ? (body as { token: string }).token.trim() : ''
  if (!TOKEN_RE.test(token)) return jsonError('Geçersiz Todoist token', 400)

  let remote: TodoistTask[] | 'unauthorized'
  try {
    remote = await fetchTodoistTasks(token)
  } catch (err) {
    console.error('import/todoist: Todoist okunamadı', err instanceof Error ? err.message : 'unknown')
    return jsonError('Todoist şu an yanıt vermiyor', 502)
  }
  if (remote === 'unauthorized') return jsonError('Todoist token geçersiz ya da iptal edilmiş', 401)

  const items = remote.map(todoistToExternal).filter((t): t is ExternalTaskInput => t !== null)
  try {
    const result = await importExternalTasks(auth.supabase, auth.userId, 'todoist', items)
    return NextResponse.json({ ok: true, found: remote.length, ...result })
  } catch (err) {
    console.error('import/todoist: kayıt hatası', err)
    return jsonError('Görevler kaydedilemedi', 500)
  }
}
