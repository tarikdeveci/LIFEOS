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
  labelEn: string
  group: EquipmentGroup
  /** Etiketin tek başına yetmediği yerde neyin dahil olduğunu söyler. */
  hint?: string
  hintEn?: string
}

export const EQUIPMENT_GROUP_LABELS: Record<EquipmentGroup, string> = {
  free_weights: 'Serbest ağırlık',
  stations:     'Sehpa ve istasyonlar',
  machines:     'Makineler',
  small_gear:   'Küçük ekipman',
  cardio:       'Kardiyo aletleri',
  outdoor:      'Havuz ve dış mekan',
}

export const EQUIPMENT_GROUP_LABELS_EN: Record<EquipmentGroup, string> = {
  free_weights: 'Free weights',
  stations:     'Benches and stations',
  machines:     'Machines',
  small_gear:   'Small gear',
  cardio:       'Cardio machines',
  outdoor:      'Pool and outdoors',
}

export const EQUIPMENT: Record<EquipmentKey, EquipmentInfo> = {
  dumbbell:        { label: 'Dambıl', labelEn: 'Dumbbells', group: 'free_weights' },
  barbell:         { label: 'Barbell (halter)', labelEn: 'Barbell', group: 'free_weights', hint: 'Bar ve plakalar', hintEn: 'Bar and plates' },
  trap_bar:        { label: 'Trap bar', labelEn: 'Trap bar', group: 'free_weights' },
  kettlebell:      { label: 'Kettlebell', labelEn: 'Kettlebell', group: 'free_weights' },
  bench:           { label: 'Sehpa (bench)', labelEn: 'Bench', group: 'stations', hint: 'Düz ya da ayarlanabilir', hintEn: 'Flat or adjustable' },
  squat_rack:      { label: 'Squat kafesi', labelEn: 'Squat rack', group: 'stations', hint: 'Barı omuz hizasında tutan rack', hintEn: 'Holds the bar at shoulder height' },
  pullup_bar:      { label: 'Barfiks barı', labelEn: 'Pull-up bar', group: 'stations' },
  dip_station:     { label: 'Paralel bar', labelEn: 'Dip station', group: 'stations', hint: 'Dips için', hintEn: 'For dips' },
  hyperextension:  { label: 'Hiperekstansiyon sehpası', labelEn: 'Hyperextension bench', group: 'stations' },
  cable:           { label: 'Kablo istasyonu', labelEn: 'Cable station', group: 'machines', hint: 'Lat pulldown ve kablo row dahil', hintEn: 'Includes lat pulldown and cable row' },
  smith_machine:   { label: 'Smith makinesi', labelEn: 'Smith machine', group: 'machines' },
  leg_press:       { label: 'Leg press', labelEn: 'Leg press', group: 'machines' },
  hack_squat:      { label: 'Hack squat', labelEn: 'Hack squat', group: 'machines' },
  leg_machines:    { label: 'Bacak makineleri', labelEn: 'Leg machines', group: 'machines', hint: 'Leg curl, leg extension, baldır, abduktör', hintEn: 'Leg curl, leg extension, calf, abductor' },
  upper_machines:  { label: 'Üst vücut makineleri', labelEn: 'Upper body machines', group: 'machines', hint: 'Chest press, pec deck, omuz press, row makinesi', hintEn: 'Chest press, pec deck, shoulder press, row machine' },
  resistance_band: { label: 'Direnç bandı', labelEn: 'Resistance band', group: 'small_gear' },
  ab_wheel:        { label: 'Karın tekerleği', labelEn: 'Ab wheel', group: 'small_gear' },
  jump_rope:       { label: 'Atlama ipi', labelEn: 'Jump rope', group: 'small_gear' },
  treadmill:       { label: 'Koşu bandı', labelEn: 'Treadmill', group: 'cardio' },
  exercise_bike:   { label: 'Sabit bisiklet', labelEn: 'Exercise bike', group: 'cardio' },
  elliptical:      { label: 'Eliptik', labelEn: 'Elliptical', group: 'cardio' },
  rowing_machine:  { label: 'Kürek makinesi', labelEn: 'Rowing machine', group: 'cardio' },
  pool:            { label: 'Havuz', labelEn: 'Pool', group: 'outdoor' },
  bicycle:         { label: 'Bisiklet', labelEn: 'Bicycle', group: 'outdoor', hint: 'Yolda sürülen', hintEn: 'Ridden on the road' },
}

/** Seçim ekranındaki sıra: gruplar yukarıdaki sırayla, grup içinde tanım sırası. */
export const EQUIPMENT_KEYS = Object.keys(EQUIPMENT) as EquipmentKey[]

export interface EquipmentPreset {
  id: 'full_gym' | 'home_dumbbell' | 'bodyweight'
  label: string
  labelEn: string
  keys: EquipmentKey[]
}

// Hazır kurulumlar yalnızca başlangıç noktası: kullanıcı birini seçip üstüne
// tek tek ekler ya da çıkarır. Tam salon havuz ve yol bisikletini içermez,
// ikisi salon üyeliğiyle gelmiyor.
export const EQUIPMENT_PRESETS: EquipmentPreset[] = [
  {
    id: 'full_gym',
    label: 'Tam donanımlı salon',
    labelEn: 'Fully equipped gym',
    keys: EQUIPMENT_KEYS.filter((key) => EQUIPMENT[key].group !== 'outdoor'),
  },
  { id: 'home_dumbbell', label: 'Ev: dambıl ve sehpa', labelEn: 'Home: dumbbells and bench', keys: ['dumbbell', 'bench', 'resistance_band'] },
  { id: 'bodyweight', label: 'Sadece vücut ağırlığı', labelEn: 'Bodyweight only', keys: [] },
]

/** Arayüz diline göre alet adı. */
export function equipmentLabel(key: EquipmentKey, lang: 'tr' | 'en' = 'tr'): string {
  return lang === 'en' ? EQUIPMENT[key].labelEn : EQUIPMENT[key].label
}
