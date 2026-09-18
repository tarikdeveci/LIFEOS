// ============================================================
// Antrenman koçu için ekipman bağlamı
// ============================================================
//
// Kullanıcının erişebildiği aletler user_profiles.preferences.workout_equipment
// içinde. Anahtarlar ve anlamı packages/shared/src/constants/equipment.ts ile
// aynı; edge function'lar o paketi içe aktaramadığı için etiketler burada
// tekrar ediyor. Anahtar eklenirse iki yer ve 047'deki CHECK birlikte değişir.

const EQUIPMENT_LABELS: Record<string, string> = {
  dumbbell: 'dambıl',
  barbell: 'barbell',
  trap_bar: 'trap bar',
  kettlebell: 'kettlebell',
  bench: 'sehpa',
  squat_rack: 'squat kafesi',
  pullup_bar: 'barfiks barı',
  dip_station: 'paralel bar',
  hyperextension: 'hiperekstansiyon sehpası',
  cable: 'kablo istasyonu (lat pulldown ve kablo row dahil)',
  smith_machine: 'smith makinesi',
  leg_press: 'leg press',
  hack_squat: 'hack squat',
  leg_machines: 'bacak makineleri (leg curl, leg extension, baldır, abduktör)',
  upper_machines: 'üst vücut makineleri (chest press, pec deck, omuz press, row makinesi)',
  resistance_band: 'direnç bandı',
  ab_wheel: 'karın tekerleği',
  jump_rope: 'atlama ipi',
  treadmill: 'koşu bandı',
  exercise_bike: 'sabit bisiklet',
  elliptical: 'eliptik',
  rowing_machine: 'kürek makinesi',
  pool: 'havuz',
  bicycle: 'yol bisikleti',
}

/**
 * Tercih değerini doğrular. null = kullanıcı seçim yapmamış, [] = yalnızca
 * vücut ağırlığı. Bilinmeyen anahtarlar atılır.
 */
export function parseEquipmentPreference(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  return value.filter((key): key is string => typeof key === 'string' && key in EQUIPMENT_LABELS)
}

/**
 * Katalog satırının yanına yazılan etiket. Bilinmeyen ekipman (null) etiketsiz
 * kalır; modele kural olarak "etiketsizden kaçın" deniyor.
 */
export function equipmentTag(equipment: string[] | null | undefined): string {
  if (equipment == null) return ''
  return equipment.length === 0 ? ' [alet yok]' : ` [${equipment.join('+')}]`
}

/** KULLANICININ DURUMU bloğundaki ekipman satırı. */
export function equipmentSummary(owned: string[] | null): string {
  if (owned === null) return 'Erişebildiği aletler: seçim yapmamış, tam donanımlı salon varsay.'
  if (owned.length === 0) return 'Erişebildiği aletler: hiç alet yok, yalnızca [alet yok] etiketli hareketler.'
  return `Erişebildiği aletler: ${owned.map((key) => `${key} (${EQUIPMENT_LABELS[key]})`).join(', ')}.`
}

/** Hareketin gerektirdiği aletlerin hepsi elde mi. Bilinmeyen ekipman engel sayılmaz. */
export function isDoableWith(equipment: string[] | null | undefined, owned: string[] | null): boolean {
  if (owned === null || equipment == null) return true
  return equipment.every((key) => owned.includes(key))
}
