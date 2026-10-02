import { createHmac, timingSafeEqual } from 'node:crypto'
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

const MAX_SKEW_S = 5 * 60

/**
 * Slack istek imzası (v0): HMAC-SHA256(signing secret, "v0:<ts>:<ham gövde>").
 * 5 dakikadan eski istek tekrar saldırısı sayılır. Gövde ayrıştırılmadan önce doğrulanır.
 */
export function verifySlackSignature(headers: Headers, rawBody: string, nowSeconds = Date.now() / 1000): boolean {
  const secret = process.env['SLACK_SIGNING_SECRET']
  const ts = headers.get('x-slack-request-timestamp') ?? ''
  const signature = headers.get('x-slack-signature') ?? ''
  if (!secret || !/^\d+$/.test(ts) || Math.abs(nowSeconds - Number(ts)) > MAX_SKEW_S) return false
  const expected = `v0=${createHmac('sha256', secret).update(`v0:${ts}:${rawBody}`).digest('hex')}`
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Slack kullanıcısının bağlı olduğu LifeOS hesabı; bağlı değilse null. */
export async function slackOwner(admin: Admin, teamId: string, slackUserId: string): Promise<string | null> {
  const { data } = await admin
    .from('integrations')
    .select('user_id')
    .eq('provider', 'slack')
    .eq('status', 'active')
    .eq('settings->>team_id', teamId)
    .eq('settings->>slack_user_id', slackUserId)
    .limit(1)
    .maybeSingle()
  return (data as { user_id: string } | null)?.user_id ?? null
}

/** Slack mesajının kalıcı bağlantısı (bot token gerekmeden). */
export function slackPermalink(teamDomain: string, channelId: string, ts: string): string | undefined {
  if (!/^[a-z0-9-]+$/i.test(teamDomain) || !/^[A-Z0-9]+$/.test(channelId) || !/^\d+\.\d+$/.test(ts)) return undefined
  return `https://${teamDomain}.slack.com/archives/${channelId}/p${ts.replace('.', '')}`
}

/** Mesaj metnini görev başlığına çevirir: Slack biçimlendirmesi sadeleşir, ilk 200 karakter. */
export function slackTitle(text: string): string {
  return text
    .replace(/<([^>|]+)\|([^>]+)>/g, '$2')
    .replace(/<[@#!]?([^>]+)>/g, '$1')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}
