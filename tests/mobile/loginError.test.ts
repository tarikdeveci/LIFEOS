import { test } from 'node:test'
import assert from 'node:assert/strict'

import { loginErrorKey } from '../../apps/mobile/src/auth/loginError.ts'

test('yanlış e-posta veya şifre', () => {
  assert.equal(loginErrorKey({ code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 }), 'acc_login_err_credentials')
  assert.equal(loginErrorKey({ message: 'Invalid login credentials', status: 400 }), 'acc_login_err_credentials')
})

test('e-posta doğrulanmamış', () => {
  assert.equal(loginErrorKey({ code: 'email_not_confirmed', message: 'Email not confirmed' }), 'acc_login_err_unconfirmed')
  assert.equal(loginErrorKey({ message: 'Email not confirmed' }), 'acc_login_err_unconfirmed')
})

test('çok fazla deneme', () => {
  assert.equal(loginErrorKey({ code: 'over_request_rate_limit', status: 429 }), 'acc_login_err_rate_limit')
  assert.equal(loginErrorKey({ code: 'over_email_send_rate_limit' }), 'acc_login_err_rate_limit')
  assert.equal(loginErrorKey({ status: 429 }), 'acc_login_err_rate_limit')
})

test('bağlantı yok', () => {
  assert.equal(loginErrorKey({ name: 'AuthRetryableFetchError', message: 'Network request failed', status: 0 }), 'acc_login_err_network')
})

test('bilinmeyen hata genel mesaja düşer, ham İngilizce metin gösterilmez', () => {
  assert.equal(loginErrorKey({ message: 'Something odd happened', status: 500 }), 'acc_login_err_generic')
  assert.equal(loginErrorKey(new Error('boom')), 'acc_login_err_generic')
  assert.equal(loginErrorKey(null), 'acc_login_err_generic')
})
