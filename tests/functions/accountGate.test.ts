import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { isAccountRequired } from '../../supabase/functions/_shared/accountGate.ts'
import { isPermanentAccount } from '../../apps/web/lib/api/accountGate.ts'

const CONFIRMED = '2026-10-01T10:00:00Z'

const CASES = [
  { name: 'misafir', user: { is_anonymous: true, email_confirmed_at: null }, blocked: true },
  { name: 'misafir, e-posta onaylı görünse bile', user: { is_anonymous: true, email_confirmed_at: CONFIRMED }, blocked: true },
  { name: 'kalıcı, e-posta onaysız', user: { is_anonymous: false, email_confirmed_at: null }, blocked: true },
  { name: 'kalıcı, alan yok', user: {}, blocked: true },
  { name: 'kalıcı ve onaylı', user: { is_anonymous: false, email_confirmed_at: CONFIRMED }, blocked: false },
  { name: 'eski JWT, is_anonymous alanı yok, onaylı', user: { email_confirmed_at: CONFIRMED }, blocked: false },
]

for (const c of CASES) {
  test(`hesap kapısı: ${c.name}`, () => {
    assert.equal(isAccountRequired(c.user), c.blocked)
    assert.equal(isPermanentAccount(c.user), !c.blocked)
  })
}

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

test('sunucu kapısı: para harcayan ve üçüncü tarafı çağıran rotalar kapıdan geçer', () => {
  for (const path of [
    'apps/web/app/api/integrations/google/start/route.ts',
    'apps/web/app/api/import/todoist/route.ts',
    'apps/web/lib/integrations/handoff.ts',
  ]) {
    assert.match(read(path), /requirePermanent\(auth\)/, path)
  }
  for (const path of ['apps/web/app/api/payment/create/route.ts', 'apps/web/app/api/api-keys/route.ts']) {
    assert.match(read(path), /requirePermanentUser\(user\)/, path)
  }
  assert.match(read('supabase/functions/ai-suggest/index.ts'), /isAccountRequired\(user\)\) return json\(.*account_required.*403\)/)
})

test('sunucu kapısı: bağlantı kesme misafire de açık, öğün kaydı 403 vermez', () => {
  assert.doesNotMatch(read('apps/web/app/api/integrations/google/disconnect/route.ts'), /requirePermanent/)
  const parseMeal = read('supabase/functions/parse-meal/index.ts')
  assert.doesNotMatch(parseMeal, /account_required/)
  assert.match(parseMeal, /isAccountRequired\(user\) \? \{ pro: false, useModel: false, limited: false \}/)
})
