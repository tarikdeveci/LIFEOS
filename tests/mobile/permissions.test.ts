import { test } from 'node:test'
import assert from 'node:assert/strict'

import { requestOrOpenSettings } from '../../apps/mobile/src/utils/permissions.ts'

function setup(response: { status: string; canAskAgain: boolean }) {
  let opened = 0
  const run = () =>
    requestOrOpenSettings(async () => response, async () => { opened += 1 })
  return { run, opened: () => opened }
}

test('izin verilince ayarlar açılmaz', async () => {
  const s = setup({ status: 'granted', canAskAgain: true })
  assert.equal(await s.run(), true)
  assert.equal(s.opened(), 0)
})

test('reddedildi ama yeniden sorulabiliyorsa ayarlar açılmaz', async () => {
  const s = setup({ status: 'denied', canAskAgain: true })
  assert.equal(await s.run(), false)
  assert.equal(s.opened(), 0)
})

test('kalıcı reddedildiyse (diyalog artık çıkmıyor) ayarlar açılır', async () => {
  const s = setup({ status: 'denied', canAskAgain: false })
  assert.equal(await s.run(), false)
  assert.equal(s.opened(), 1)
})
