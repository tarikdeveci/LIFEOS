import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { GOOGLE_REVOKE_URL } from '@/lib/integrations/google'

export const runtime = 'nodejs'

function failed(message: string) {
  console.error('google/disconnect:', message)
  return NextResponse.json({ ok: false, error: 'Bağlantı kesilemedi' }, { status: 500 })
}

/**
 * Google bağlantısını keser: token'ı Google'da iptal eder, satırı siler. Vault kaydı,
 * kuyruk, meşgul penceresi ve etkinlik kimlikleri tetikleyicilerle temizlenir (056, 057).
 * Google'daki "LifeOS" takvimi kullanıcıda kalır.
 */
export async function POST(req: Request) {
  const auth = await authenticateRequest(req)
  if (!auth) return NextResponse.json({ ok: false, error: 'Oturum gerekli' }, { status: 401 })

  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from('integrations')
    .select('id')
    .eq('user_id', auth.userId)
    .eq('provider', 'google_calendar')
  if (error) return failed(error.message)

  for (const row of (rows ?? []) as { id: string }[]) {
    try {
      const { data: secret } = await admin.rpc('integration_get_secret', { p_integration: row.id })
      const token = typeof secret === 'string' ? (JSON.parse(secret) as { refresh_token?: string }).refresh_token : undefined
      if (token) await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST' })
    } catch (err) {
      // İptal olmasa da bağlantı kesilir; token Vault'tan silinir.
      console.error('google/disconnect: iptal başarısız', err instanceof Error ? err.message : 'unknown')
    }
    // Satır silinmediyse bağlantı sunucuda yaşıyor ve senkron sürer: başarı dönülmez.
    const { error: deleteError } = await admin.from('integrations').delete().eq('id', row.id)
    if (deleteError) return failed(deleteError.message)
  }
  return NextResponse.json({ ok: true })
}
