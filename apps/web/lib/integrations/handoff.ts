import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * OAuth state'inin tüketimi ve mobil devir. Mobil akışta yetki tarayıcısında LifeOS oturumu
 * yok; callback bağlantıyı doğrudan yazsaydı, başkasının başlattığı yetki adresini onaylayan
 * kişinin dış hesabı başlatanın LifeOS hesabına bağlanırdı. Bu yüzden mobilde callback kodu
 * yalnızca uygulamaya devreder; bağlantıyı uygulama kendi oturumuyla /complete'te bitirir ve
 * sunucu oturum sahibinin akışı başlatan kullanıcı olduğunu denetler.
 */

const STATE_TTL_MS = 10 * 60 * 1000

export interface SavedState { user_id: string; code_verifier: string; redirect_to: string; created_at: string }
export type ConnectResult = 'ok' | 'denied'
/** Kodu token'a çevirip bağlantıyı yazan sağlayıcıya özgü adım; hata fırlatır. */
export type Connect = (userId: string, verifier: string, code: string) => Promise<ConnectResult>

type Admin = ReturnType<typeof createAdminClient>

/** State'i tek kullanımlık siler ve döndürür (süresi dolmuş olsa da). userId verilirse yalnız o kullanıcınınki. */
export async function consumeState(admin: Admin, state: string, provider: string, userId?: string): Promise<SavedState | null> {
  if (!state) return null
  let query = admin.from('oauth_states').delete().eq('state', state).eq('provider', provider)
  if (userId) query = query.eq('user_id', userId)
  const { data } = await query.select('user_id, code_verifier, redirect_to, created_at').maybeSingle()
  return data as SavedState | null
}

export const isExpired = (saved: SavedState) => Date.now() - new Date(saved.created_at).getTime() > STATE_TTL_MS

export const isMobileReturn = (redirectTo: string) => !redirectTo.startsWith('/')

/** Sonuçla birlikte web ayarlarına ya da mobil derin bağlantıya döner. */
export function finish(req: Request, slug: string, redirectTo: string, status: ConnectResult | 'error' | 'pending', extra: Record<string, string> = {}) {
  const target = redirectTo.startsWith('/') ? new URL(redirectTo, new URL(req.url).origin) : new URL(redirectTo)
  target.searchParams.set('integration', slug)
  target.searchParams.set('status', status)
  for (const [key, value] of Object.entries(extra)) target.searchParams.set(key, value)
  return NextResponse.redirect(target.toString(), 302)
}

/** Mobil: kodu yeni, tek kullanımlık bir devir state'iyle uygulamaya geçirir; bağlantı yazılmaz. */
export async function handOffToApp(req: Request, admin: Admin, slug: string, provider: string, saved: SavedState, code: string) {
  const handoff = randomBytes(24).toString('base64url')
  const { error } = await admin.from('oauth_states').insert({
    state: handoff, user_id: saved.user_id, provider, code_verifier: saved.code_verifier, redirect_to: saved.redirect_to,
  })
  if (error) return finish(req, slug, saved.redirect_to, 'error')
  return finish(req, slug, saved.redirect_to, 'pending', { handoff, code })
}

/** POST /complete: { handoff, code }. Devir state'i yalnız onu başlatan kullanıcının oturumuyla tüketilir. */
export async function completeHandoff(req: Request, slug: string, provider: string, connect: Connect) {
  const auth = await authenticateRequest(req)
  if (!auth) return NextResponse.json({ ok: false, error: 'Oturum gerekli' }, { status: 401 })
  let body: { handoff?: unknown; code?: unknown } = {}
  try { body = (await req.json()) as typeof body } catch { /* aşağıda reddedilir */ }
  if (typeof body.handoff !== 'string' || typeof body.code !== 'string' || !body.code) {
    return NextResponse.json({ ok: false, error: 'Eksik istek' }, { status: 400 })
  }
  const saved = await consumeState(createAdminClient(), body.handoff, provider, auth.userId)
  if (!saved || isExpired(saved) || !isMobileReturn(saved.redirect_to)) {
    return NextResponse.json({ ok: false, error: 'Geçersiz ya da süresi dolmuş istek' }, { status: 403 })
  }
  try {
    const status = await connect(saved.user_id, saved.code_verifier, body.code)
    return NextResponse.json({ ok: status === 'ok', status })
  } catch (err) {
    console.error(`${slug}/complete:`, err instanceof Error ? err.message : 'unknown')
    return NextResponse.json({ ok: false, error: 'Bağlantı kurulamadı' }, { status: 502 })
  }
}
