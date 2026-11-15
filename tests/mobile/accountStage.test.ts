import { test } from 'node:test'
import assert from 'node:assert/strict'

import { deriveAccountStage, isAnonymousStage, parseStageHint } from '../../apps/mobile/src/auth/accountStage.ts'

test('oturum yoksa aşama yok', () => {
  assert.equal(deriveAccountStage(null), null)
  assert.equal(deriveAccountStage(undefined), null)
})

test('anonim kullanıcı misafir, bekleyen e-postası varsa onay bekliyor', () => {
  assert.equal(deriveAccountStage({ is_anonymous: true }), 'guest')
  assert.equal(deriveAccountStage({ is_anonymous: true, new_email: 'a@b.co' }), 'pending_email')
})

test('kalıcı kullanıcı şifre belirlemediyse şifre bekliyor', () => {
  const user = { is_anonymous: false, email: 'a@b.co', email_confirmed_at: '2026-01-01', identities: [{ provider: 'email' }], user_metadata: {} }
  assert.equal(deriveAccountStage(user), 'needs_password')
  assert.equal(deriveAccountStage({ ...user, user_metadata: { password_set: false } }), 'needs_password')
})

test('şifresi belirlenen kalıcı kullanıcı hazır', () => {
  const user = { email: 'a@b.co', email_confirmed_at: '2026-01-01', identities: [{ provider: 'email' }], user_metadata: { password_set: true } }
  assert.equal(deriveAccountStage(user), 'ready')
})

test('Google ile gelen kullanıcı şifresiz hazır', () => {
  const user = { email: 'a@b.co', email_confirmed_at: '2026-01-01', identities: [{ provider: 'google' }], user_metadata: {} }
  assert.equal(deriveAccountStage(user), 'ready')
})

test('e-postası onaylanmamış kalıcı kullanıcı onay bekliyor', () => {
  const user = { email: 'a@b.co', email_confirmed_at: null, identities: [{ provider: 'email' }], user_metadata: { password_set: true } }
  assert.equal(deriveAccountStage(user), 'pending_email')
})

test('anonim aşamalar misafir sayılır', () => {
  assert.equal(isAnonymousStage('guest'), true)
  assert.equal(isAnonymousStage('pending_email'), true)
  assert.equal(isAnonymousStage('needs_password'), false)
  assert.equal(isAnonymousStage('ready'), false)
  assert.equal(isAnonymousStage(null), false)
})

test('çevrimdışı ipucu yalnız bilinen aşamayı kabul eder', () => {
  assert.equal(parseStageHint('ready'), 'ready')
  assert.equal(parseStageHint('x'), null)
  assert.equal(parseStageHint(null), null)
})
