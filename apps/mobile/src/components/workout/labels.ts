import { equipmentLabel, missingEquipment } from '@lifeos/shared'
import type { EquipmentKey, Exercise } from '@lifeos/shared'
import type { Language, Translations } from '../../i18n'

/** Egzersiz adı arayüz diline göre; İngilizce ad yoksa Türkçesi. */
export function exerciseName(e: { name: string; name_en?: string | null } | null | undefined, lang: Language, t: Translations): string {
  if (!e) return t.wk_exercise
  return lang === 'en' ? (e.name_en ?? e.name) : e.name
}

export function muscleGroupName(g: { name: string; name_en: string } | null | undefined, lang: Language): string {
  return g ? (lang === 'en' ? g.name_en : g.name) : '-'
}

export function categoryLabel(category: string, t: Translations): string {
  return ({
    strength: t.wk_cat_strength, cardio: t.wk_cat_cardio, flexibility: t.wk_cat_flexibility, mobility: t.wk_cat_mobility,
  } as Record<string, string>)[category] ?? category
}

/** Eksik alet notu: "Alet yok: Kablo istasyonu". */
export function missingLabel(exercise: Exercise, owned: EquipmentKey[] | null, lang: Language, t: Translations): string | null {
  const missing = missingEquipment(exercise, owned)
  if (missing.length === 0) return null
  return t.wk_missing_equipment.replace('{list}', missing.map((key) => equipmentLabel(key, lang)).join(', '))
}
