import { test } from 'node:test'
import assert from 'node:assert/strict'

import { resolveLanguage } from '../../apps/mobile/src/utils/language.ts'

test('resolveLanguage: kayıtlı seçim cihaz dilinden önce gelir', () => {
  assert.equal(resolveLanguage('en', 'tr-TR'), 'en')
  assert.equal(resolveLanguage('tr', 'en-US'), 'tr')
})

test('resolveLanguage: seçim yoksa cihaz dili Türkçe ise tr, değilse en', () => {
  assert.equal(resolveLanguage(null, 'tr-TR'), 'tr')
  assert.equal(resolveLanguage(null, 'tr'), 'tr')
  assert.equal(resolveLanguage(undefined, 'en-US'), 'en')
  assert.equal(resolveLanguage(null, 'de-DE'), 'en')
  assert.equal(resolveLanguage(null, 'trv'), 'en')
  assert.equal(resolveLanguage(null, undefined), 'en')
  assert.equal(resolveLanguage('fr', 'tr-TR'), 'tr')
})
