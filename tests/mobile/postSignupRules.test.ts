import test from 'node:test'
import assert from 'node:assert/strict'
import { afterAiResult, afterConfirmation, postSignupKey } from '../../apps/mobile/src/auth/postSignupRules.ts'

test('ai kapısından gelen paywall onayda bekletilir', () => {
  assert.deepEqual(afterConfirmation('ai'), { write: 'pending_ai', openNow: false })
})

test('diğer nedenler ve doğrudan kayıt onaydan sonra paywall açar', () => {
  assert.deepEqual(afterConfirmation('paywall'), { write: 'shown', openNow: true })
  assert.deepEqual(afterConfirmation(undefined), { write: 'shown', openNow: true })
})

test('bekleyen paywall ilk AI sonucunda bir kez açılır', () => {
  assert.deepEqual(afterAiResult('pending_ai'), { write: 'shown', open: true })
  assert.deepEqual(afterAiResult('shown'), { write: null, open: false })
  assert.deepEqual(afterAiResult(null), { write: null, open: false })
})

test('anahtar kullanıcıya bağlı', () => {
  assert.equal(postSignupKey('u1'), 'lifeos_post_signup_paywall:u1')
})
