import { NextResponse } from 'next/server'
import { randomBytes, createHash } from 'node:crypto'
import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// node:crypto ve service-role client gerektirir.
export const runtime = 'nodejs'

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

function unauthorized() {
  return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
}

// Link açık mı, takvim en son ne zaman çekti. Token bir daha gösterilemez.
export async function GET() {
  const userId = await getUserId()
  if (!userId) return unauthorized()

  const { data, error } = await createAdminClient()
    .from('calendar_feeds')
    .select('created_at, last_fetched_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('calendar GET hatası', error)
    return NextResponse.json({ error: 'Takvim linki alınamadı' }, { status: 500 })
  }
  return NextResponse.json({ feed: data ?? null })
}

// Yeni link üretir; varsa eskisi o an çalışmaz olur. Tam link yalnızca bu yanıtta döner.
export async function POST(req: Request) {
  const userId = await getUserId()
  if (!userId) return unauthorized()

  const token = randomBytes(32).toString('base64url')
  const { data, error } = await createAdminClient()
    .from('calendar_feeds')
    .upsert(
      { user_id: userId, token_hash: sha256(token), created_at: new Date().toISOString(), last_fetched_at: null },
      { onConflict: 'user_id' },
    )
    .select('created_at, last_fetched_at')
    .single()

  if (error || !data) {
    console.error('calendar POST hatası', error)
    return NextResponse.json({ error: 'Takvim linki oluşturulamadı' }, { status: 500 })
  }

  const url = `${new URL(req.url).origin}/api/calendar/feed/${token}.ics`
  return NextResponse.json({ feed: data, url }, { status: 201 })
}

// Aboneliği kapatır; takvim uygulaması bir sonraki çekişte 404 alır.
export async function DELETE() {
  const userId = await getUserId()
  if (!userId) return unauthorized()

  const { error } = await createAdminClient().from('calendar_feeds').delete().eq('user_id', userId)
  if (error) {
    console.error('calendar DELETE hatası', error)
    return NextResponse.json({ error: 'Takvim linki kapatılamadı' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
