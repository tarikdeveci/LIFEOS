import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'

import { slackPermalink, slackTitle, verifySlackSignature } from '../../apps/web/lib/integrations/slack.ts'

const SECRET = 'test-signing-secret'
process.env['SLACK_SIGNING_SECRET'] = SECRET

function signed(body: string, ts: number, secret = SECRET): Headers {
  const sig = `v0=${createHmac('sha256', secret).update(`v0:${ts}:${body}`).digest('hex')}`
  return new Headers({ 'x-slack-request-timestamp': String(ts), 'x-slack-signature': sig })
}

test('Slack imzası: doğru imza geçer, değişen gövde ve yanlış anahtar geçmez', () => {
  const now = 1_790_000_000
  const body = 'team_id=T1&user_id=U1&text=yar%C4%B1n+rapor'
  assert.equal(verifySlackSignature(signed(body, now), body, now), true)
  assert.equal(verifySlackSignature(signed(body, now), body + 'x', now), false)
  assert.equal(verifySlackSignature(signed(body, now, 'baska'), body, now), false)
})

test('Slack imzası: 5 dakikadan eski istek tekrar saldırısı sayılır', () => {
  const now = 1_790_000_000
  const body = 'text=a'
  assert.equal(verifySlackSignature(signed(body, now - 301), body, now), false)
  assert.equal(verifySlackSignature(new Headers(), body, now), false)
})

test('Slack metni ve bağlantı', () => {
  assert.equal(slackTitle('*Acil* <https://x.com|rapor> için <@U123> ile   konuş'), 'Acil rapor için U123 ile konuş')
  assert.equal(slackTitle('a'.repeat(300)).length, 200)
  assert.equal(slackPermalink('acme', 'C0123', '1712345678.000200'), 'https://acme.slack.com/archives/C0123/p1712345678000200')
  assert.equal(slackPermalink('acme', 'C0123', 'kötü'), undefined)
})
