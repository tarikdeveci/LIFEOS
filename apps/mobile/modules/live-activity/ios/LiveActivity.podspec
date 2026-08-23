Pod::Spec.new do |s|
  s.name           = 'LiveActivity'
  s.version        = '1.0.0'
  s.summary        = 'LifeOS aktif blok canli bildirimi (ActivityKit koprusu)'
  s.description    = 'JS tarafindan ActivityKit Live Activity baslatir, gunceller ve bitirir.'
  s.author         = 'LifeOS'
  s.homepage       = 'https://lifeos.tr'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
