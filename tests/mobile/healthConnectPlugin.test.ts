import { test } from 'node:test'
import assert from 'node:assert/strict'

import plugin from '../../apps/mobile/plugins/withHealthConnectPermissions.js'

const { addPermissionDelegate, addRationaleAlias } = plugin

const MAIN_ACTIVITY = `package tr.lifeos.app

import android.os.Bundle

import com.facebook.react.ReactActivity

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    setTheme(R.style.AppTheme);
    super.onCreate(null)
  }
}
`

test('MainActivity: izin delegesi import edilir ve super.onCreate sonrasında kaydedilir', () => {
  const patched = addPermissionDelegate(MAIN_ACTIVITY)
  assert.match(patched, /^import dev\.matinzd\.healthconnect\.permissions\.HealthConnectPermissionDelegate$/m)
  assert.match(patched, /    super\.onCreate\(null\)\n    HealthConnectPermissionDelegate\.setPermissionDelegate\(this\)\n  \}/)
})

test('MainActivity: plugin ikinci kez çalışınca çift eklemez', () => {
  const once = addPermissionDelegate(MAIN_ACTIVITY)
  assert.equal(addPermissionDelegate(once), once)
})

test('MainActivity: şablonda super.onCreate yoksa build durur', () => {
  assert.throws(() => addPermissionDelegate(MAIN_ACTIVITY.replace('super.onCreate(null)', '')), /super\.onCreate/)
})

test('Manifest: Android 14+ izin gerekçesi alias\'ı bir kez eklenir', () => {
  const application: Record<string, unknown[]> = { activity: [{ $: { 'android:name': '.MainActivity' } }] }
  addRationaleAlias(application)
  addRationaleAlias(application)

  assert.equal(application['activity-alias'].length, 1)
  assert.deepEqual(application['activity-alias'][0], {
    $: {
      'android:name': 'ViewPermissionUsageActivity',
      'android:exported': 'true',
      'android:targetActivity': '.MainActivity',
      'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
    },
    'intent-filter': [
      {
        action: [{ $: { 'android:name': 'android.intent.action.VIEW_PERMISSION_USAGE' } }],
        category: [{ $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } }],
      },
    ],
  })
})
