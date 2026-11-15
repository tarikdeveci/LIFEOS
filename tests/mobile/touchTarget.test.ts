import { test } from 'node:test'
import assert from 'node:assert/strict'

import { MIN_TOUCH, hitSlopFor } from '../../apps/mobile/src/theme/tokens.ts'

test('küçük ikon hitSlop ile 44x44 olur (#39)', () => {
  for (const size of [14, 16, 17, 18, 20]) {
    const s = hitSlopFor(size)
    assert.ok(size + s.left + s.right >= MIN_TOUCH, `${size} genişlik`)
    assert.ok(size + s.top + s.bottom >= MIN_TOUCH, `${size} yükseklik`)
  }
})

test('dikdörtgen düğmede iki eksen ayrı tamamlanır', () => {
  const s = hitSlopFor(50, 28)
  assert.equal(s.left + s.right, 0)
  assert.ok(28 + s.top + s.bottom >= MIN_TOUCH)
})

test('zaten 44 ve üstündeyse ek alan yok', () => {
  assert.deepEqual(hitSlopFor(44), { top: 0, bottom: 0, left: 0, right: 0 })
  assert.deepEqual(hitSlopFor(60), { top: 0, bottom: 0, left: 0, right: 0 })
})
