// Antrenman akışı metinleri (bugünün program günü, Bitir özeti, set uygulama, hata durumları).
// i18nWorkout.ts 500 satıra dayandığı için ayrı dosyada; tr, en ile aynı anahtarları taşır.
// Bölümler ayrı işlerden doldurulur, her iş sadece kendi bölümüne yazar.

export const workoutFlowEn = {
  // -- bolum: bugun-ve-bitir --

  // -- bolum: set-uygula --
  wkf_add_n_sets: 'Add {n} sets',
  wkf_delete_set_title: 'Delete this set?',
  wkf_delete_set_body: 'The set will be removed from this workout.',
  wkf_delete_set_label: 'Delete set',

  // -- bolum: hata-durumlari --

}

export const workoutFlowTr: typeof workoutFlowEn = {
  // -- bolum: bugun-ve-bitir --

  // -- bolum: set-uygula --
  wkf_add_n_sets: '{n} set ekle',
  wkf_delete_set_title: 'Set silinsin mi?',
  wkf_delete_set_body: 'Set bu antrenmandan kaldırılır.',
  wkf_delete_set_label: 'Seti sil',

  // -- bolum: hata-durumlari --

}
