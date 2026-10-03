Pod::Spec.new do |s|
  s.name           = 'BackgroundRemover'
  s.version        = '1.0.0'
  s.summary        = 'On-device background removal for DDrobe closet photos'
  s.description    = 'Uses Apple Vision foreground instance masks (iOS 17+) to replace photo backgrounds with white.'
  s.license        = 'UNLICENSED'
  s.author         = 'DDrobe'
  s.homepage       = 'https://github.com/sasukerawal/DDrobe'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'CoreImage', 'UIKit'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
