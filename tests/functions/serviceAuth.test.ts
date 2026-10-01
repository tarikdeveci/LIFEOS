import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isServiceRole } from '../../supabase/functions/_shared/serviceAuth.ts'

/** İmzasız test JWT'si: imzayı gateway doğrular, burada yalnızca rol iddiası okunur. */
function jwt(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part(claims)}.imza`
}

const request = (authorization?: string) =>
  new Request('https://x.supabase.co/functions/v1/calendar-sync', {
    method: 'POST',
    headers: authorization ? { Authorization: authorization } : {},
  })

test('cron çağrısı: service_role anahtarı geçer', () => {
  assert.equal(isServiceRole(request(`Bearer ${jwt({ role: 'service_role', iss: 'supabase' })}`)), true)
  // base64url'e özgü karakterler (- ve _) içeren gövde de çözülür.
  assert.equal(isServiceRole(request(`bearer ${jwt({ ref: '???>>>~~~', role: 'service_role' })}`)), true)
})

test('cron çağrısı: anon anahtarı, kullanıcı oturumu ve bozuk başlık geçmez', () => {
  assert.equal(isServiceRole(request(`Bearer ${jwt({ role: 'anon' })}`)), false)
  assert.equal(isServiceRole(request(`Bearer ${jwt({ role: 'authenticated', sub: 'u1' })}`)), false)
  assert.equal(isServiceRole(request(`Bearer ${jwt({ user_metadata: { role: 'service_role' } })}`)), false)
  assert.equal(isServiceRole(request()), false)
  assert.equal(isServiceRole(request('Bearer service_role')), false)
  assert.equal(isServiceRole(request('Bearer a.%%%.c')), false)
  assert.equal(isServiceRole(request(`Basic ${jwt({ role: 'service_role' })}`)), false)
})
