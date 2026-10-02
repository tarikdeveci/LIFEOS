import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { detectNotionMapping } from '@lifeos/shared/utils'

export const runtime = 'nodejs'

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2025-09-03'
const MAX_PAGES = 5

type Admin = ReturnType<typeof createAdminClient>

/** Kullanıcının Notion bağlantısı ve erişim anahtarı; yoksa null. */
async function notionAccess(admin: Admin, userId: string, integrationId: string) {
  const { data } = await admin
    .from('integrations')
    .select('id, settings')
    .eq('id', integrationId)
    .eq('user_id', userId)
    .eq('provider', 'notion')
    .maybeSingle()
  if (!data) return null
  const { data: secret } = await admin.rpc('integration_get_secret', { p_integration: integrationId })
  const token = typeof secret === 'string' ? (JSON.parse(secret) as { access_token?: string }).access_token : undefined
  if (!token) return null
  return { token, settings: ((data as { settings: Record<string, unknown> | null }).settings ?? {}) }
}

function notion(token: string, path: string, init?: RequestInit) {
  return fetch(`${NOTION_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
  })
}

/** Paylaşılmış veri kaynaklarını listeler: ?integration=<id> */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  if ((await params).provider !== 'notion') return NextResponse.json({ ok: false }, { status: 404 })
  const auth = await authenticateRequest(req)
  if (!auth) return NextResponse.json({ ok: false, error: 'Oturum gerekli' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('integration') ?? ''
  const admin = createAdminClient()
  const access = await notionAccess(admin, auth.userId, id)
  if (!access) return NextResponse.json({ ok: false, error: 'Bağlantı bulunamadı' }, { status: 404 })

  // Üst sayfa paylaşılınca altındaki bütün veritabanları gelir: tek sayfayla yetinilirse
  // sonrakiler seçicide hiç görünmez.
  const sources: { id: string; name: string }[] = []
  let cursor: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await notion(access.token, '/search', {
      method: 'POST',
      body: JSON.stringify({
        filter: { property: 'object', value: 'data_source' }, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}),
      }),
    })
    if (!res.ok) return NextResponse.json({ ok: false, error: 'Notion yanıt vermedi' }, { status: 502 })
    const body = (await res.json()) as {
      results?: { id: string; title?: { plain_text?: string }[] }[]; has_more?: boolean; next_cursor?: string | null
    }
    for (const s of body.results ?? []) {
      sources.push({ id: s.id, name: (s.title ?? []).map((t) => t.plain_text ?? '').join('').trim() || 'Adsız' })
    }
    if (!body.has_more || !body.next_cursor) break
    cursor = body.next_cursor
  }
  return NextResponse.json({ ok: true, sources, selected: access.settings['data_source_id'] ?? null })
}

/** Veri kaynağını seçer, şemadan eşlemeyi çıkarır. Body: { integration, data_source_id } */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  if ((await params).provider !== 'notion') return NextResponse.json({ ok: false }, { status: 404 })
  const auth = await authenticateRequest(req)
  if (!auth) return NextResponse.json({ ok: false, error: 'Oturum gerekli' }, { status: 401 })

  let body: { integration?: unknown; data_source_id?: unknown }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ ok: false }, { status: 400 }) }
  if (typeof body.integration !== 'string' || typeof body.data_source_id !== 'string' || !/^[0-9a-f-]{32,36}$/i.test(body.data_source_id)) {
    return NextResponse.json({ ok: false, error: 'Geçersiz istek' }, { status: 400 })
  }

  const admin = createAdminClient()
  const access = await notionAccess(admin, auth.userId, body.integration)
  if (!access) return NextResponse.json({ ok: false, error: 'Bağlantı bulunamadı' }, { status: 404 })

  const res = await notion(access.token, `/data_sources/${body.data_source_id}`)
  if (!res.ok) return NextResponse.json({ ok: false, error: 'Veri kaynağı okunamadı' }, { status: 502 })
  const source = (await res.json()) as { properties?: Record<string, { type: string }> }
  const mapping = detectNotionMapping(source.properties ?? {})
  if (!mapping) return NextResponse.json({ ok: false, error: 'Başlık özelliği yok' }, { status: 422 })

  const { error } = await admin
    .from('integrations')
    .update({ settings: { ...access.settings, data_source_id: body.data_source_id, mapping }, last_error: null })
    .eq('id', body.integration)
  if (error) return NextResponse.json({ ok: false, error: 'Kaydedilemedi' }, { status: 500 })
  return NextResponse.json({ ok: true, mapping })
}
