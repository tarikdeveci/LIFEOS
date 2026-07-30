/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = (config) => ({
  type: 'widget',
  name: 'LifeOS',
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
