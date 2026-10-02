import { NextResponse } from 'next/server'
import { importExternalTasks } from '@lifeos/shared/supabase'
import { createAdminClient } from '@/lib/supabase/admin'
import { slackOwner, slackPermalink, slackTitle, verifySlackSignature } from '@/lib/integrations/slack'

export const runtime = 'nodejs'

interface MessageAction {
  type?: string
  callback_id?: string
  team?: { id?: string; domain?: string }
  user?: { id?: string }
  channel?: { id?: string }
  message?: { ts?: string; text?: string }
  response_url?: string
}

/** Kısayolun sonucunu yalnızca kullanıcıya gösterir (kanalda görünmez). */
async function reply(responseUrl: string | undefined, text: string) {
  if (!responseUrl?.startsWith('https://hooks.slack.com/')) return
  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response_type: 'ephemeral', text }),
  }).catch(() => undefined)
}

/**
 * Mesaj kısayolu "LifeOS'a ekle" (callback_id lifeos_add_task): mesajın ilk 200 karakteri
 * görev olur, kalıcı bağlantısı "Kaynakta aç" için saklanır. Aynı mesaj iki kez
 * eklenirse tek görev kalır (dış kimlik: takım:kanal:ts). Mesaj geçmişi okunmaz.
 */
export async function POST(req: Request) {
  const raw = await req.text()
  if (!verifySlackSignature(req.headers, raw)) return new NextResponse('invalid signature', { status: 401 })

  let payload: MessageAction
  try {
    payload = JSON.parse(new URLSearchParams(raw).get('payload') ?? '') as MessageAction
  } catch {
    return new NextResponse('bad payload', { status: 400 })
  }
  if (payload.type !== 'message_action' || payload.callback_id !== 'lifeos_add_task') return new NextResponse(null, { status: 200 })

  const teamId = payload.team?.id ?? ''
  const channelId = payload.channel?.id ?? ''
  const ts = payload.message?.ts ?? ''
  const admin = createAdminClient()
  const userId = await slackOwner(admin, teamId, payload.user?.id ?? '')
  if (!userId) {
    await reply(payload.response_url, 'Bu Slack hesabı LifeOS\'a bağlı değil. LifeOS > Ayarlar > Entegrasyonlar\'dan Slack\'i bağla.')
    return new NextResponse(null, { status: 200 })
  }

  const title = slackTitle(payload.message?.text ?? '') || 'Slack mesajı'
  try {
    const url = slackPermalink(payload.team?.domain ?? '', channelId, ts)
    await importExternalTasks(admin, userId, 'slack', [{
      title,
      external_id: `${teamId}:${channelId}:${ts}`,
      ...(url ? { external_url: url } : {}),
      status: 'backlog',
      tags: ['slack'],
    }])
    await reply(payload.response_url, `LifeOS'a eklendi: ${title}`)
  } catch (err) {
    console.error('slack/interact:', err instanceof Error ? err.message : 'unknown')
    await reply(payload.response_url, 'Görev eklenemedi, biraz sonra tekrar dene.')
  }
  return new NextResponse(null, { status: 200 })
}
