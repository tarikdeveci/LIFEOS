import { NextResponse } from 'next/server'
import { randomBytes, createHash } from 'node:crypto'
import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Node runtime — node:crypto gerektirir.
export const runtime = 'nodejs'

const KEY_PREFIX = 'lifeos_sk_'

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

async function getUserId(): Promise<string | null> {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

// Kullanıcının anahtarlarını listele (yalnızca güvenli alanlar — key_hash asla dönmez)
export async function GET() {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('api_keys')
    .select('id, name, key_prefix, last_used_at, created_at')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('api-keys GET hatası', error)
    return NextResponse.json({ error: 'Anahtarlar alınamadı' }, { status: 500 })
  }
  return NextResponse.json({ keys: data ?? [] })
}

// Yeni anahtar oluştur — tam anahtar YALNIZCA bu yanıtta, bir kez döner
export async function POST(req: Request) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  let name = 'API Anahtarı'
  try {
    const body = (await req.json()) as { name?: unknown }
    if (typeof body?.name === 'string' && body.name.trim()) {
      name = body.name.trim().slice(0, 100)
    }
  } catch {
    // gövde opsiyonel — varsayılan isim kullanılır
  }

  const secret = randomBytes(24).toString('base64url')
  const fullKey = `${KEY_PREFIX}${secret}`
  const keyPrefix = `${KEY_PREFIX}${secret.slice(0, 6)}…`

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('api_keys')
    .insert({
      user_id: userId,
      name,
      key_prefix: keyPrefix,
      key_hash: sha256(fullKey),
    })
    .select('id, name, key_prefix, created_at')
    .single()

  if (error || !data) {
    console.error('api-keys POST hatası', error)
    return NextResponse.json({ error: 'Anahtar oluşturulamadı' }, { status: 500 })
  }

  // key alanı sadece burada; DB'de yalnızca hash tutulur, bir daha gösterilemez
  return NextResponse.json({ ...data, key: fullKey }, { status: 201 })
}

// Anahtar iptal (revoke) — hash tutulur ama artık doğrulanmaz
export async function DELETE(req: Request) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id gerekli' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId) // yalnızca kendi anahtarı

  if (error) {
    console.error('api-keys DELETE hatası', error)
    return NextResponse.json({ error: 'Anahtar iptal edilemedi' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
