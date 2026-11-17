// Antrenman akışı metinleri (bugünün program günü, Bitir özeti, set uygulama, hata durumları).
// i18nWorkout.ts 500 satıra dayandığı için ayrı dosyada; tr, en ile aynı anahtarları taşır.
// Bölümler ayrı işlerden doldurulur, her iş sadece kendi bölümüne yazar.

export const workoutFlowEn = {
  // -- bolum: bugun-ve-bitir --

  // -- bolum: set-uygula --

  // -- bolum: hata-durumlari --
  wkf_programs_loading: 'Loading programs...',
  wkf_programs_error: 'Programs could not be loaded, please try again.',
  wkf_programs_empty: 'You have no programs yet, choose a ready-made template to get started.',
  wkf_show_templates: 'Browse templates',
  wkf_history_loading: 'Loading workout history...',
  wkf_history_error: 'Workout history could not be loaded, please try again.',
  wkf_history_empty: 'You have no workout history yet, start your first workout from the Today tab.',
  wkf_retry: 'Try again',

}

export const workoutFlowTr: typeof workoutFlowEn = {
  // -- bolum: bugun-ve-bitir --

  // -- bolum: set-uygula --

  // -- bolum: hata-durumlari --
  wkf_programs_loading: 'Programlar yükleniyor...',
  wkf_programs_error: 'Programlar yüklenemedi, lütfen tekrar deneyin.',
  wkf_programs_empty: 'Henüz programınız yok, başlamak için hazır bir şablon seçin.',
  wkf_show_templates: 'Hazır programları göster',
  wkf_history_loading: 'Antrenman geçmişi yükleniyor...',
  wkf_history_error: 'Antrenman geçmişi yüklenemedi, lütfen tekrar deneyin.',
  wkf_history_empty: 'Henüz antrenman geçmişiniz yok, ilk antrenmanınızı Bugün alt sekmesinden başlatın.',
  wkf_retry: 'Tekrar dene',

}
