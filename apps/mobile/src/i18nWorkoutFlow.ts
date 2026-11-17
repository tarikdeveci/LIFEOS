// Antrenman akışı metinleri (bugünün program günü, Bitir özeti, set uygulama, hata durumları).
// i18nWorkout.ts 500 satıra dayandığı için ayrı dosyada; tr, en ile aynı anahtarları taşır.
// Bölümler ayrı işlerden doldurulur, her iş sadece kendi bölümüne yazar.

export const workoutFlowEn = {
  // -- bolum: bugun-ve-bitir --
  wkf_today_program: 'Today: {program} · {day}',
  wkf_more_n: '+{n} more',
  wkf_unfinished_n: '{n} sets not done',
  wkf_unfinished_delete: 'Delete',
  wkf_unfinished_complete: 'Count as done',
  wkf_minutes_unit: 'min',
  wkf_summary_title: 'Workout complete',
  wkf_sum_sets: 'Sets done',
  wkf_sum_volume: 'Total volume',
  wkf_sum_duration: 'Duration',
  wkf_sum_records: 'New records',
  wkf_sum_record_row: '{name}: est. 1RM {value} kg',
  wkf_done: 'Done',
  wkf_err_finish: 'Could not save. Your entries are kept, try again.',
  wkf_default_workout_name: 'Workout',
  wkf_from_yesterday: 'From yesterday, not finished yet',
  wkf_finish_open_first: 'Finish the open workout from yesterday first.',
  wkf_today_load_error: "Today's workout could not be loaded.",

  // -- bolum: set-uygula --
  wkf_add_n_sets: 'Add {n} sets',
  wkf_delete_set_title: 'Delete this set?',
  wkf_delete_set_body: 'The set will be removed from this workout.',
  wkf_delete_set_label: 'Delete set',

  // -- bolum: hata-durumlari --

}

export const workoutFlowTr: typeof workoutFlowEn = {
  // -- bolum: bugun-ve-bitir --
  wkf_today_program: 'Bugün: {program} · {day}',
  wkf_more_n: '+{n} daha',
  wkf_unfinished_n: '{n} set yapılmadı',
  wkf_unfinished_delete: 'Sil',
  wkf_unfinished_complete: 'Yapıldı say',
  wkf_minutes_unit: 'dk',
  wkf_summary_title: 'Antrenman tamamlandı',
  wkf_sum_sets: 'Yapılan set',
  wkf_sum_volume: 'Toplam hacim',
  wkf_sum_duration: 'Süre',
  wkf_sum_records: 'Yeni rekorlar',
  wkf_sum_record_row: '{name}: tahmini 1RM {value} kg',
  wkf_done: 'Tamam',
  wkf_err_finish: 'Kaydedilemedi. Girdilerin duruyor, tekrar dene.',
  wkf_default_workout_name: 'Antrenman',
  wkf_from_yesterday: 'Dünden kalan, henüz bitmedi',
  wkf_finish_open_first: 'Önce dünden kalan açık antrenmanı bitir.',
  wkf_today_load_error: 'Bugünkü antrenman yüklenemedi.',

  // -- bolum: set-uygula --
  wkf_add_n_sets: '{n} set ekle',
  wkf_delete_set_title: 'Set silinsin mi?',
  wkf_delete_set_body: 'Set bu antrenmandan kaldırılır.',
  wkf_delete_set_label: 'Seti sil',

  // -- bolum: hata-durumlari --

}
