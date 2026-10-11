import { test } from 'node:test'
import assert from 'node:assert/strict'

import plugin from '../../apps/mobile/plugins/withHealthConnectPermissions.js'

const { addPermissionDelegate, addRationaleActivity, rationaleActivitySource } = plugin

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

test('Manifest: gerekçe activity\'si ve Android 14+ alias\'ı bir kez eklenir, MainActivity\'ye dokunulmaz', () => {
  const mainActivity = { $: { 'android:name': '.MainActivity' } }
  const application: Record<string, unknown[]> = { activity: [mainActivity] }
  addRationaleActivity(application)
  addRationaleActivity(application)

  assert.deepEqual(application.activity, [
    mainActivity,
    {
      $: {
        'android:name': '.PermissionsRationaleActivity',
        'android:exported': 'true',
        'android:theme': '@android:style/Theme.NoDisplay',
      },
      'intent-filter': [
        { action: [{ $: { 'android:name': 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE' } }] },
      ],
    },
  ])
  assert.deepEqual(application['activity-alias'], [
    {
      $: {
        'android:name': 'ViewPermissionUsageActivity',
        'android:exported': 'true',
        'android:targetActivity': '.PermissionsRationaleActivity',
        'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'android.intent.action.VIEW_PERMISSION_USAGE' } }],
          category: [{ $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } }],
        },
      ],
    },
  ])
})

test('Gerekçe activity\'si uygulama paketinde üretilir ve gizlilik politikasını açar', () => {
  const source = rationaleActivitySource('tr.lifeos.app')
  assert.match(source, /^package tr\.lifeos\.app$/m)
  assert.match(source, /class PermissionsRationaleActivity : Activity\(\)/)
  assert.match(source, /Uri\.parse\("https:\/\/lifeos\.tr\/gizlilik-kvkk"\)/)
})
