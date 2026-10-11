const fs = require('fs')
const path = require('path')
const { withAndroidManifest, withDangerousMod, withMainActivity } = require('expo/config-plugins')

// react-native-health-connect'in native kurulumunun tamamı burada. Kütüphanenin kendi plugin'i
// (gerekçe filtresini MainActivity'ye ekler) app.json'da kayıtlı değil: ikisi birlikte çalışırsa
// gerekçe intent'ini iki activity karşılar.
// 1. MainActivity izin delegesini kaydetmezse requestPermission() uygulamayı çökertir
//    (lateinit requestPermission; JS try/catch yakalamaz).
// 2. İzin ekranı, gerekçe intent'ini karşılayan bir activity bulamazsa açılır açılmaz kapanır:
//    Android 13 ve altı ACTION_SHOW_PERMISSIONS_RATIONALE, Android 14+ ise
//    VIEW_PERMISSION_USAGE + HEALTH_PERMISSIONS (alias) arar.
// 3. O activity gizlilik politikasını göstermeli; izin ekranındaki bağlantı onu açar.

const DELEGATE_IMPORT = 'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate'
const DELEGATE_CALL = 'HealthConnectPermissionDelegate.setPermissionDelegate(this)'
const RATIONALE_ACTIVITY = 'PermissionsRationaleActivity'
const ALIAS_NAME = 'ViewPermissionUsageActivity'
const PRIVACY_POLICY_URL = 'https://lifeos.tr/gizlilik-kvkk'

function addPermissionDelegate(contents) {
  if (contents.includes(DELEGATE_CALL)) return contents

  const superOnCreate = /^([ \t]*)super\.onCreate\([^)]*\);?[ \t]*$/m
  if (!superOnCreate.test(contents) || !/^import /m.test(contents)) {
    // Sessizce atlamak çökmeyi mağazaya taşır; şablon değiştiyse build burada dursun.
    throw new Error('withHealthConnectPermissions: MainActivity içinde super.onCreate(...) bulunamadı')
  }

  return contents
    .replace(/^import /m, `${DELEGATE_IMPORT}\nimport `)
    .replace(superOnCreate, (line, indent) => `${line}\n${indent}${DELEGATE_CALL}`)
}

function rationaleActivitySource(packageName) {
  return `package ${packageName}

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle

class ${RATIONALE_ACTIVITY} : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    try {
      startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("${PRIVACY_POLICY_URL}")))
    } catch (e: ActivityNotFoundException) {
      // Tarayıcı yoksa politikayı gösterecek yer yok.
    }
    finish()
  }
}
`
}

function addRationaleActivity(application) {
  const activities = application.activity ?? []
  if (!activities.some((activity) => activity.$['android:name'] === `.${RATIONALE_ACTIVITY}`)) {
    activities.push({
      $: {
        'android:name': `.${RATIONALE_ACTIVITY}`,
        'android:exported': 'true',
        'android:theme': '@android:style/Theme.NoDisplay',
      },
      'intent-filter': [
        { action: [{ $: { 'android:name': 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE' } }] },
      ],
    })
    application.activity = activities
  }

  const aliases = application['activity-alias'] ?? []
  if (aliases.some((alias) => alias.$['android:name'] === ALIAS_NAME)) return

  aliases.push({
    $: {
      'android:name': ALIAS_NAME,
      'android:exported': 'true',
      'android:targetActivity': `.${RATIONALE_ACTIVITY}`,
      'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
    },
    'intent-filter': [
      {
        action: [{ $: { 'android:name': 'android.intent.action.VIEW_PERMISSION_USAGE' } }],
        category: [{ $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } }],
      },
    ],
  })
  application['activity-alias'] = aliases
}

function withHealthConnectPermissions(config) {
  const withDelegate = withMainActivity(config, (mod) => {
    mod.modResults.contents = addPermissionDelegate(mod.modResults.contents)
    return mod
  })

  const withManifest = withAndroidManifest(withDelegate, (mod) => {
    addRationaleActivity(mod.modResults.manifest.application[0])
    return mod
  })

  return withDangerousMod(withManifest, [
    'android',
    (mod) => {
      const packageName = mod.android.package
      const dir = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/java', ...packageName.split('.'))
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, `${RATIONALE_ACTIVITY}.kt`), rationaleActivitySource(packageName))
      return mod
    },
  ])
}

module.exports = withHealthConnectPermissions
module.exports.addPermissionDelegate = addPermissionDelegate
module.exports.addRationaleActivity = addRationaleActivity
module.exports.rationaleActivitySource = rationaleActivitySource
