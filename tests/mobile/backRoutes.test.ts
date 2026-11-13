import { test } from 'node:test'
import assert from 'node:assert/strict'

import { backFallback, swipeBackEnabled } from '../../apps/mobile/src/navigation/backRoutes.ts'

test('geçmiş yokken alt sayfa kendi üstüne döner', () => {
  assert.equal(backFallback('/settings/calendar'), '/(tabs)/settings')
  assert.equal(backFallback('/settings'), '/(tabs)/today')
  assert.equal(backFallback('/profile'), '/(tabs)/today')
  assert.equal(backFallback('/exercise/12'), '/(tabs)/workout')
  assert.equal(backFallback('/task/12'), '/(tabs)/tasks')
  assert.equal(backFallback('/integrations/google'), '/(tabs)/settings/integrations')
})

test('kayıt ve şifre yenileme geçmiş yoksa girişe döner', () => {
  assert.equal(backFallback('/register'), '/(auth)/login')
  assert.equal(backFallback('/reset-password'), '/(auth)/login')
})

test('bilinmeyen yeni ekran Bugün ekranına döner', () => {
  assert.equal(backFallback('/yeni-ekran'), '/(tabs)/today')
  assert.equal(backFallback('/tasks-archive'), '/(tabs)/today')
})

test('ana sekmede, girişte ve satın almada kaydırma kapalı', () => {
  for (const route of ['/', '/today', '/planning', '/tasks', '/nutrition', '/workout', '/login', '/onboarding', '/paywall']) {
    assert.equal(swipeBackEnabled(route, 'android'), false, route)
    assert.equal(swipeBackEnabled(route, 'ios'), false, route)
  }
})

test('Android tüm alt ekranlarda açık, yeni ekran da kendiliğinden alır', () => {
  for (const route of ['/profile', '/settings', '/settings/calendar', '/exercise/1', '/task/1', '/review', '/report', '/yeni-ekran']) {
    assert.equal(swipeBackEnabled(route, 'android'), true, route)
  }
})

test('iOS yalnız Tabs alt sayfalarında açık, Stack ekranları kendi kaydırmasını kullanır', () => {
  for (const route of ['/profile', '/settings', '/settings/notifications']) assert.equal(swipeBackEnabled(route, 'ios'), true, route)
  for (const route of ['/exercise/1', '/task/1', '/review', '/report']) assert.equal(swipeBackEnabled(route, 'ios'), false, route)
})
