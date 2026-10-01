// Form doğrulama, kayıt hatası ve AI plan onayı metinleri (planlama, rutin, hedef). Ana i18n.ts 500 satırı
// aştığı için ayrı dosyada; getTranslations birleştirir. tr, en ile aynı anahtarları taşımak zorunda.

export const formsEn = {
  plan_err_name_required: 'Enter a title',
  plan_err_pick_day: 'Pick at least one day',
  plan_err_time_required: 'Enter a start and end time',
  plan_err_time_invalid: 'Times must be in HH:MM format',
  plan_err_end_after_start: 'End time must be after start time',
  plan_block_add_error: 'Could not add the block. Check your connection.',
  plan_refresh_error: 'Could not refresh. Check your connection.',
  routines_err_per_week: 'Enter a number from 1 to 7',
  routines_err_per_day: 'Enter a number from 1 to 20',
  goals_err_target: 'Target must be at least 1',
  goals_load_error: 'Goals could not be loaded',
  plan_ai_changes: 'Proposed changes ({n}):',
  plan_ai_apply: 'Apply changes',
  plan_ai_applied: 'Applied',
  plan_ai_apply_error: 'Some changes could not be applied. Check your plan.',
} as const

export const formsTr: Record<keyof typeof formsEn, string> = {
  plan_err_name_required: 'Başlık gir',
  plan_err_pick_day: 'En az bir gün seç',
  plan_err_time_required: 'Başlangıç ve bitiş saati gir',
  plan_err_time_invalid: 'Saat SS:DD biçiminde olmalı',
  plan_err_end_after_start: 'Bitiş saati başlangıçtan sonra olmalı',
  plan_block_add_error: 'Blok eklenemedi. Bağlantını kontrol et.',
  plan_refresh_error: 'Yenilenemedi. Bağlantını kontrol et.',
  routines_err_per_week: '1 ile 7 arasında bir sayı gir',
  routines_err_per_day: '1 ile 20 arasında bir sayı gir',
  goals_err_target: 'Hedef en az 1 olmalı',
  goals_load_error: 'Hedefler yüklenemedi',
  plan_ai_changes: 'Önerilen değişiklikler ({n}):',
  plan_ai_apply: 'Değişiklikleri uygula',
  plan_ai_applied: 'Uygulandı',
  plan_ai_apply_error: 'Bazı değişiklikler uygulanamadı. Planını kontrol et.',
}
