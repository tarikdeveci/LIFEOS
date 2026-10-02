import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import type { ExternalTaskInput, TaskSource } from '@lifeos/shared/types'
import { importExternalTasks } from '@lifeos/shared/supabase'
import { createAdminClient } from '@/lib/supabase/admin'

// Node runtime — node:crypto ve service-role client gerektirir.
export const runtime = 'nodejs'

const MAX_BATCH = 50
const MAX_TITLE = 500
const MAX_DESC = 5000
const MAX_TAGS = 20
const MAX_TAG_LEN = 50
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_EXTERNAL_ID = 200
const MAX_URL = 2000
const SOURCES: readonly TaskSource[] = ['api', 'jira', 'slack', 'notion', 'todoist', 'ticktick', 'microsoft_todo', 'apple_reminders']

interface TaskPayload {
  user_id: string
  title: string
  status: 'backlog'
  tags: string[]
  description?: string
  due_date?: string
  scheduled_date?: string
  estimated_minutes?: number
  value_score?: number
  urgency_score?: number
  risk_score?: number
  effort_score?: number
  friction_score?: number
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function bearerToken(req: Request): string | null {
  const auth = req.headers.get('authorization')
  if (!auth) return null
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim())
  return m ? m[1]!.trim() : null
}

function clampScore(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined
  return Math.min(5, Math.max(1, Math.round(v)))
}

// Esnek gövde: { tasks: [...] } | { title, ... } | [ ... ]
function normalizeIncoming(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>
    if (Array.isArray(obj['tasks'])) return obj['tasks']
    if (typeof obj['title'] === 'string') return [body]
  }
  return null
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

/**
 * Dış otomasyonların (mail → görev) LifeOS'a görev göndermesi için ingest endpoint'i.
 *
 * Auth:  Authorization: Bearer <api_key>
 * Body:  { "tasks": [ { "title": "...", "description"?, "due_date"? (YYYY-MM-DD),
 *                        "scheduled_date"?, "estimated_minutes"?, "tags"? } ] }
 *        (tek görev için { "title": "..." } veya doğrudan dizi de kabul edilir)
 *
 * Görevler kullanıcının backlog'una 'inbox' etiketiyle düşer.
 *
 * Tekrarsız gönderim: görevde "external_id" varsa (user, source, external_id) ile
 * upsert edilir; aynı görev ikinci kez gelirse yeni kayıt açılmaz, başlık/açıklama/
 * tarih güncellenir (LifeOS'ta tamamlanmışsa dokunulmaz). "source" gövdenin
 * kökünde verilir, varsayılan "api". Yanıtta created/updated/skipped sayıları var.
 */
export async function POST(req: Request) {
  const token = bearerToken(req)
  if (!token) {
    return jsonError('Eksik veya geçersiz Authorization başlığı (Bearer <api_key> bekleniyor)', 401)
  }

  const admin = createAdminClient()

  // 1) Anahtar doğrula
  const { data: keyRow, error: keyErr } = await admin
    .from('api_keys')
    .select('id, user_id')
    .eq('key_hash', sha256(token))
    .is('revoked_at', null)
    .maybeSingle()

  if (keyErr) {
    console.error('inbox: api_keys sorgu hatası', keyErr)
    return jsonError('Sunucu hatası', 500)
  }
  if (!keyRow) {
    return jsonError('Geçersiz API anahtarı', 401)
  }

  // 2) Gövdeyi çöz
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError('Geçersiz JSON gövdesi', 400)
  }

  const incoming = normalizeIncoming(body)
  if (!incoming || incoming.length === 0) {
    return jsonError("En az bir görev gönderilmeli — { tasks: [...] } veya { title: '...' }", 400)
  }
  if (incoming.length > MAX_BATCH) {
    return jsonError(`Tek istekte en fazla ${MAX_BATCH} görev gönderilebilir`, 400)
  }

  const rawSource = body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)['source']
    : undefined
  if (rawSource != null && (typeof rawSource !== 'string' || !SOURCES.includes(rawSource as TaskSource))) {
    return jsonError(`'source' şunlardan biri olmalı: ${SOURCES.join(', ')}`, 400)
  }
  const source = (rawSource as TaskSource | undefined) ?? 'api'

  // 3) Doğrula + payload üret
  const payloads: TaskPayload[] = []
  const external: ExternalTaskInput[] = []
  for (let i = 0; i < incoming.length; i++) {
    const raw = incoming[i]
    if (!raw || typeof raw !== 'object') {
      return jsonError(`Görev #${i + 1} geçersiz (nesne bekleniyor)`, 400)
    }
    const t = raw as Record<string, unknown>

    const title = typeof t['title'] === 'string' ? t['title'].trim() : ''
    if (!title) return jsonError(`Görev #${i + 1}: 'title' zorunlu`, 400)
    if (title.length > MAX_TITLE) return jsonError(`Görev #${i + 1}: 'title' çok uzun (max ${MAX_TITLE})`, 400)

    const payload: TaskPayload = {
      user_id: keyRow.user_id as string,
      title,
      status: 'backlog',
      tags: ['inbox'],
    }

    if (typeof t['description'] === 'string' && t['description'].trim()) {
      payload.description = t['description'].trim().slice(0, MAX_DESC)
    }

    // Tarih alanları (opsiyonel, YYYY-MM-DD)
    for (const field of ['due_date', 'scheduled_date'] as const) {
      const v = t[field]
      if (v == null) continue
      if (typeof v !== 'string' || !DATE_RE.test(v)) {
        return jsonError(`Görev #${i + 1}: '${field}' YYYY-MM-DD formatında olmalı`, 400)
      }
      if (field === 'due_date') payload.due_date = v
      else payload.scheduled_date = v
    }

    if (t['estimated_minutes'] != null) {
      const m = Number(t['estimated_minutes'])
      if (Number.isFinite(m) && m > 0) payload.estimated_minutes = Math.round(m)
    }

    // Ek etiketler — 'inbox' her zaman dahil
    if (Array.isArray(t['tags'])) {
      const extra = t['tags']
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.trim())
        .filter((x) => x.length > 0 && x.length <= MAX_TAG_LEN)
      payload.tags = Array.from(new Set(['inbox', ...extra])).slice(0, MAX_TAGS)
    }

    // WSJF skorları (opsiyonel, 1-5 arası clamp)
    const scoreFields = ['value_score', 'urgency_score', 'risk_score', 'effort_score', 'friction_score'] as const
    for (const field of scoreFields) {
      const s = clampScore(t[field])
      if (s != null) payload[field] = s
    }

    const externalId = t['external_id']
    if (externalId != null) {
      if (typeof externalId !== 'string' && typeof externalId !== 'number') {
        return jsonError(`Görev #${i + 1}: 'external_id' metin olmalı`, 400)
      }
      const id = String(externalId).trim()
      if (!id || id.length > MAX_EXTERNAL_ID) {
        return jsonError(`Görev #${i + 1}: 'external_id' 1-${MAX_EXTERNAL_ID} karakter olmalı`, 400)
      }
      const url = typeof t['external_url'] === 'string' ? t['external_url'].trim() : ''
      if (url && (!/^https?:\/\//i.test(url) || url.length > MAX_URL)) {
        return jsonError(`Görev #${i + 1}: 'external_url' http(s) adresi olmalı`, 400)
      }
      const { user_id: _uid, ...input } = payload
      external.push({ ...input, external_id: id, ...(url ? { external_url: url } : {}) })
      continue
    }

    payloads.push(payload)
  }

  // 4a) Kimlikli görevler: upsert
  let upserted = { created: 0, updated: 0, skipped: 0 }
  if (external.length > 0) {
    try {
      upserted = await importExternalTasks(admin, keyRow.user_id as string, source, external)
    } catch (err) {
      console.error('inbox: upsert hatası', err)
      return jsonError('Görevler eklenemedi', 500)
    }
  }

  if (payloads.length === 0) {
    await admin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRow.id)
    return NextResponse.json({ ok: true, ...upserted, tasks: [] })
  }

  // 4b) Kimliksiz görevler: her gönderim yeni kayıt
  const { data: inserted, error: insErr } = await admin
    .from('tasks')
    .insert(payloads)
    .select('id, title')

  if (insErr || !inserted) {
    console.error('inbox: görev ekleme hatası', insErr)
    return jsonError('Görevler eklenemedi', 500)
  }

  // 5) task_details oluştur (createTask davranışıyla tutarlı — hata kritik değil)
  const { error: detErr } = await admin
    .from('task_details')
    .insert(inserted.map((row: { id: string }) => ({ task_id: row.id })))
  if (detErr) {
    console.error('inbox: task_details ekleme hatası (yok sayıldı)', detErr)
  }

  // 6) Anahtar son kullanım zamanı
  await admin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRow.id)

  return NextResponse.json({
    ok: true,
    created: inserted.length + upserted.created,
    updated: upserted.updated,
    skipped: upserted.skipped,
    tasks: inserted,
  })
}
