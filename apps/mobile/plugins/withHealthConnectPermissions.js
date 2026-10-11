const { withAndroidManifest, withMainActivity } = require('expo/config-plugins')

// react-native-health-connect'in kendi plugin'i yalnız ACTION_SHOW_PERMISSIONS_RATIONALE
// filtresini ekliyor. Native tarafta iki eksik kalıyor:
// 1. MainActivity izin delegesini kaydetmezse requestPermission() uygulamayı çökertir
//    (lateinit requestPermission; JS try/catch yakalamaz).
// 2. Android 14+ izin ekranı, VIEW_PERMISSION_USAGE + HEALTH_PERMISSIONS'ı karşılayan
//    bir activity bulamazsa açılır açılmaz kapanır.

const DELEGATE_IMPORT = 'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate'
const DELEGATE_CALL = 'HealthConnectPermissionDelegate.setPermissionDelegate(this)'
const ALIAS_NAME = 'ViewPermissionUsageActivity'

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

function addRationaleAlias(application) {
  const aliases = application['activity-alias'] ?? []
  if (aliases.some((alias) => alias.$['android:name'] === ALIAS_NAME)) return

  aliases.push({
    $: {
      'android:name': ALIAS_NAME,
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
  application['activity-alias'] = aliases
}

function withHealthConnectPermissions(config) {
  const withDelegate = withMainActivity(config, (mod) => {
    mod.modResults.contents = addPermissionDelegate(mod.modResults.contents)
    return mod
  })

  return withAndroidManifest(withDelegate, (mod) => {
    addRationaleAlias(mod.modResults.manifest.application[0])
    return mod
  })
}

module.exports = withHealthConnectPermissions
module.exports.addPermissionDelegate = addPermissionDelegate
module.exports.addRationaleAlias = addRationaleAlias
