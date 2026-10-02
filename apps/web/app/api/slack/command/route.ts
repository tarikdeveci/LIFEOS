import { NextResponse } from 'next/server'
import { calendarDateInTimeZone, parseQuickTask } from '@lifeos/shared/utils'
import { createParsedTask } from '@lifeos/shared/supabase'
import { createAdminClient } from '@/lib/supabase/admin'
import { slackOwner, slackTitle, verifySlackSignature } from '@/lib/integrations/slack'

export const runtime = 'nodejs'

const ephemeral = (text: string) => NextResponse.json({ response_type: 'ephemeral', text })

/**
 * `/lifeos <metin>` komutu: metin Türkçe hızlı ekleme kurallarıyla ayrıştırılır
 * ("/lifeos yarın 15:00 rapor 30dk") ve görev bağlı LifeOS hesabına yazılır.
 */
export async function POST(req: Request) {
  const raw = await req.text()
  if (!verifySlackSignature(req.headers, raw)) return new NextResponse('invalid signature', { status: 401 })

  const form = new URLSearchParams(raw)
  const text = slackTitle(form.get('text') ?? '')
  if (!text) return ephemeral('Kullanım: /lifeos yarın 15:00 rapor 30dk')

  const admin = createAdminClient()
  const userId = await slackOwner(admin, form.get('team_id') ?? '', form.get('user_id') ?? '')
  if (!userId) return ephemeral('Bu Slack hesabı LifeOS\'a bağlı değil. LifeOS > Ayarlar > Entegrasyonlar\'dan Slack\'i bağla.')

  const { data: prefs } = await admin.from('notification_preferences').select('timezone').eq('user_id', userId).maybeSingle()
  const today = calendarDateInTimeZone(new Date(), (prefs as { timezone?: string } | null)?.timezone ?? 'Europe/Istanbul')
  const parsed = parseQuickTask(text, today)

  try {
    await createParsedTask(admin, userId, parsed, { source: 'slack', extraTags: ['slack'] })
  } catch (err) {
    console.error('slack/command:', err instanceof Error ? err.message : 'unknown')
    return ephemeral('Görev eklenemedi, biraz sonra tekrar dene.')
  }

  const when = parsed.scheduled_date ? ` (${parsed.scheduled_date}${parsed.start_time ? ` ${parsed.start_time}` : ''})` : ''
  return ephemeral(`LifeOS'a eklendi: ${parsed.title}${when}`)
}
