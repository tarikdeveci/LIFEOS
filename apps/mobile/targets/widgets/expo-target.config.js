/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = (config) => ({
  type: 'widget',
  // Ana uygulama target'i da "LifeOS" adini tasiyor; ayni isimde iki target
  // "Multiple commands produce conflicting outputs" + provisioning profile
  // karisikligina yol aciyordu. Widget target'ina ayri bir isim ver.
  name: 'LifeOSWidget',
  // Bundle ID'yi sabitle: '.widget' ana uygulamaya eklenir → tr.lifeos.app.widget
  // (zaten kayitli + App Group bagli). Isim degisse de bu sabit kalmali.
  bundleIdentifier: '.widget',
  // Xcode 14+ resource bundle'ları imzalar; extension target'ının da development
  // team'i olmali yoksa "resource bundles are signed by default" hatasi veriyor.
  appleTeamId: config.ios.appleTeamId,
  // Ana uygulamayla aynı App Group — snapshot bu grup üzerinden paylaşılır
  entitlements: {
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'WidgetKit'],
  colors: {
    $widgetBackground: { color: '#FFFFFF', darkColor: '#171726' },
    $accent: '#6366F1',
  },
})
