import { connectGoogle } from '@/lib/integrations/connect'
import { completeHandoff } from '@/lib/integrations/handoff'

export const runtime = 'nodejs'

/** Mobil Google Takvim OAuth'unun son adımı: uygulama kendi oturumuyla devri tamamlar. Body: { handoff, code } */
export async function POST(req: Request) {
  return completeHandoff(req, 'google', 'google_calendar', (userId, verifier, code) =>
    connectGoogle(req, userId, verifier, code))
}
