import { NextResponse } from 'next/server'
import { connectProvider } from '@/lib/integrations/connect'
import { completeHandoff } from '@/lib/integrations/handoff'
import { providerBySlug } from '@/lib/integrations/providers'

export const runtime = 'nodejs'

/** Mobil OAuth'un son adımı: uygulama kendi oturumuyla devri tamamlar. Body: { handoff, code } */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: slug } = await params
  const provider = providerBySlug(slug)
  if (!provider) return NextResponse.json({ ok: false, error: 'Bilinmeyen sağlayıcı' }, { status: 404 })
  return completeHandoff(req, slug, provider.provider, (userId, verifier, code) =>
    connectProvider(req, slug, provider, userId, verifier, code))
}
