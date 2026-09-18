import type { EquipmentKey } from '../types/workout'

// ============================
// Ekipman sözlüğü
// ============================
// Kullanıcı erişebildiği aletleri tek tek seçer. Liste bilerek kaba taneli:
// "leg curl makinesi", "leg extension makinesi", "baldır makinesi" ayrı ayrı
// sorulsaydı seçim ekranı 40 satırı geçerdi ve bu makineler salonlarda hemen
// hep birlikte bulunur. Ayrım, evde ya da küçük salonda gerçekten değişen
// yerlerde yapıldı (barfiks barı, sehpa, kablo, leg press).
//
// Anahtarlar DB'deki CHECK kısıtıyla (047) ve EquipmentKey tipiyle aynı olmalı.

export type EquipmentGroup = 'free_weights' | 'stations' | 'machines' | 'small_gear' | 'cardio' | 'outdoor'

export interface EquipmentInfo {
  label: string
  group: EquipmentGroup
  /** Etiketin tek başına yetmediği yerde neyin dahil olduğunu söyler. */
  hint?: string
}

export const EQUIPMENT_GROUP_LABELS: Record<EquipmentGroup, string> = {
  free_weights: 'Serbest ağırlık',
  stations:     'Sehpa ve istasyonlar',
  machines:     'Makineler',
  small_gear:   'Küçük ekipman',
  cardio:       'Kardiyo aletleri',
  outdoor:      'Havuz ve dış mekan',
}

export const EQUIPMENT: Record<EquipmentKey, EquipmentInfo> = {
  dumbbell:        { label: 'Dambıl', group: 'free_weights' },
  barbell:         { label: 'Barbell (halter)', group: 'free_weights', hint: 'Bar ve plakalar' },
  trap_bar:        { label: 'Trap bar', group: 'free_weights' },
  kettlebell:      { label: 'Kettlebell', group: 'free_weights' },
  bench:           { label: 'Sehpa (bench)', group: 'stations', hint: 'Düz ya da ayarlanabilir' },
  squat_rack:      { label: 'Squat kafesi', group: 'stations', hint: 'Barı omuz hizasında tutan rack' },
  pullup_bar:      { label: 'Barfiks barı', group: 'stations' },
  dip_station:     { label: 'Paralel bar', group: 'stations', hint: 'Dips için' },
  hyperextension:  { label: 'Hiperekstansiyon sehpası', group: 'stations' },
  cable:           { label: 'Kablo istasyonu', group: 'machines', hint: 'Lat pulldown ve kablo row dahil' },
  smith_machine:   { label: 'Smith makinesi', group: 'machines' },
  leg_press:       { label: 'Leg press', group: 'machines' },
  hack_squat:      { label: 'Hack squat', group: 'machines' },
  leg_machines:    { label: 'Bacak makineleri', group: 'machines', hint: 'Leg curl, leg extension, baldır, abduktör' },
  upper_machines:  { label: 'Üst vücut makineleri', group: 'machines', hint: 'Chest press, pec deck, omuz press, row makinesi' },
  resistance_band: { label: 'Direnç bandı', group: 'small_gear' },
  ab_wheel:        { label: 'Karın tekerleği', group: 'small_gear' },
  jump_rope:       { label: 'Atlama ipi', group: 'small_gear' },
  treadmill:       { label: 'Koşu bandı', group: 'cardio' },
  exercise_bike:   { label: 'Sabit bisiklet', group: 'cardio' },
  elliptical:      { label: 'Eliptik', group: 'cardio' },
  rowing_machine:  { label: 'Kürek makinesi', group: 'cardio' },
  pool:            { label: 'Havuz', group: 'outdoor' },
  bicycle:         { label: 'Bisiklet', group: 'outdoor', hint: 'Yolda sürülen' },
}

/** Seçim ekranındaki sıra: gruplar yukarıdaki sırayla, grup içinde tanım sırası. */
export const EQUIPMENT_KEYS = Object.keys(EQUIPMENT) as EquipmentKey[]

export interface EquipmentPreset {
  id: 'full_gym' | 'home_dumbbell' | 'bodyweight'
  label: string
  keys: EquipmentKey[]
}

// Hazır kurulumlar yalnızca başlangıç noktası: kullanıcı birini seçip üstüne
// tek tek ekler ya da çıkarır. Tam salon havuz ve yol bisikletini içermez,
// ikisi salon üyeliğiyle gelmiyor.
export const EQUIPMENT_PRESETS: EquipmentPreset[] = [
  {
    id: 'full_gym',
    label: 'Tam donanımlı salon',
    keys: EQUIPMENT_KEYS.filter((key) => EQUIPMENT[key].group !== 'outdoor'),
  },
  { id: 'home_dumbbell', label: 'Ev: dambıl ve sehpa', keys: ['dumbbell', 'bench', 'resistance_band'] },
  { id: 'bodyweight', label: 'Sadece vücut ağırlığı', keys: [] },
]
