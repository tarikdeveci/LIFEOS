import type { ProgramDay, WorkoutProgram } from '@lifeos/shared'
import type { Language, Translations } from '../../i18n'
import { exerciseName } from './labels'

/** Programın planlanabilir günleri: dinlenme günleri takvime yazılmaz. */
export function activeDays(program: WorkoutProgram | null): ProgramDay[] {
  return [...(program?.days ?? [])]
    .filter((d) => !d.is_rest)
    .sort((a, b) => a.day_number - b.day_number)
}

/** Takvim etkinliğinin not alanı: o günün hareket listesi. */
export function describeDay(day: ProgramDay | undefined, lang: Language, t: Translations): string {
  const exercises = [...(day?.exercises ?? [])].sort((a, b) => a.order_index - b.order_index)
  if (exercises.length === 0) return ''
  return exercises
    .map((ex) => `• ${exerciseName(ex.exercise, lang, t)} ${ex.sets}×${ex.reps ?? '-'}`)
    .join('\n')
}

// Hazır şablonlar (user_id NULL) veritabanında Türkçe tohumlandı (017, 036, 047). İngilizce arayüzde
// ad, açıklama ve gün adları buradan gelir; kullanıcının kendi yazdığı adlara dokunulmaz.
const D = ' \u2014 '
// tr: veritabanındaki ad, en: İngilizce arayüzde görünen ad.
const TEMPLATES: { tr: string; en: string; description: string }[] = [
  { tr: 'Bro Split', en: 'Bro Split', description: 'Classic 6-day split by muscle group. Each day goes all in on one muscle group, with 1 rest day a week.' },
  { tr: 'Push Pull Legs', en: 'Push Pull Legs', description: '6-day program split into push (chest, shoulders, triceps), pull (back, biceps) and legs. Trains every muscle group twice a week.' },
  { tr: 'Full Body', en: 'Full Body', description: 'Full body training 3 days a week. Ideal for beginners and anyone short on time. Every session works all muscle groups.' },
  { tr: 'Upper Lower', en: 'Upper Lower', description: '4-day program alternating upper and lower body. Trains every muscle group twice a week, ideal for intermediate and advanced lifters.' },
  { tr: `Alt Vücut Odaklı${D}Başlangıç`, en: 'Lower Body Focus: Beginner', description: '3 days a week, full body with glutes and legs first. For beginners: easy to learn movements, moderate volume. Every session has a back or shoulder movement, so the upper body is not neglected.' },
  { tr: `Kalça & Bacak${D}Orta Seviye`, en: 'Glutes & Legs: Intermediate', description: '4 days a week. Trains glutes twice: one heavy, low-rep day and one volume and isolation day, with a full upper body day in between. For lifters who know the basic movements and can add weight.' },
  { tr: `Kalça Şekillendirme${D}2 Gün`, en: 'Glute Shaping: 2 Days', description: '2 days a week, for those short on time. Still trains glutes twice a week, since both days include glutes. Built to get the most out of few days.' },
  { tr: 'Evde Vücut Ağırlığı: Tüm Vücut', en: 'Home Bodyweight: Full Body', description: '3 days a week, no equipment needed. To make it harder, add reps, slow the lowering phase (3 seconds) and shorten rest between sets.' },
  { tr: 'Evde Dambıl: Tüm Vücut', en: 'Home Dumbbells: Full Body', description: '3 days a week, a pair of dumbbells and a flat bench are enough. With adjustable dumbbells, go heavy on leg movements and light on shoulders and arms.' },
  { tr: 'Evde Dambıl: Üst/Alt', en: 'Home Dumbbells: Upper/Lower', description: '4 days a week, with dumbbells and an adjustable bench. Each area is trained twice a week; a step up from the full body program, with more volume.' },
]
const TEMPLATE_EN = new Map(TEMPLATES.map((x) => [x.tr, x]))

const TEMPLATE_DAYS: { tr: string; en: string }[] = [
  { tr: 'Göğüs', en: 'Chest' },
  { tr: 'Sırt', en: 'Back' },
  { tr: 'Omuz', en: 'Shoulders' },
  { tr: 'Kol', en: 'Arms' },
  { tr: 'Bacak', en: 'Legs' },
  { tr: 'Dinlenme', en: 'Rest' },
  { tr: 'Karın & Kardiyo', en: 'Abs & Cardio' },
  { tr: 'Üst Vücut', en: 'Upper Body' },
  { tr: `Push A${D}Göğüs Ağırlıklı`, en: 'Push A: Chest Focus' },
  { tr: `Push B${D}Omuz Ağırlıklı`, en: 'Push B: Shoulder Focus' },
  { tr: `Pull A${D}Dikey Çekiş Ağırlıklı`, en: 'Pull A: Vertical Pull Focus' },
  { tr: `Pull B${D}Yatay Çekiş Ağırlıklı`, en: 'Pull B: Horizontal Pull Focus' },
  { tr: `Legs A${D}Quad Ağırlıklı`, en: 'Legs A: Quad Focus' },
  { tr: `Legs B${D}Hamstring & Kalça Ağırlıklı`, en: 'Legs B: Hamstring & Glute Focus' },
  { tr: `Upper A${D}Kuvvet`, en: 'Upper A: Strength' },
  { tr: `Upper B${D}Hacim`, en: 'Upper B: Volume' },
  { tr: `Lower A${D}Quad Ağırlıklı`, en: 'Lower A: Quad Focus' },
  { tr: `Lower B${D}Hamstring & Kalça`, en: 'Lower B: Hamstrings & Glutes' },
  { tr: 'Alt Vücut + Sırt', en: 'Lower Body + Back' },
  { tr: 'Alt Vücut + Omuz', en: 'Lower Body + Shoulders' },
  { tr: 'Bacak + Omuz', en: 'Legs + Shoulders' },
  { tr: 'Kalça Odaklı', en: 'Glute Focus' },
  { tr: 'Kalça İzolasyon + Sırt', en: 'Glute Isolation + Back' },
  { tr: `Kalça${D}Ağır`, en: 'Glutes: Heavy' },
  { tr: `Kalça${D}Hacim`, en: 'Glutes: Volume' },
  { tr: 'Tüm Vücut A', en: 'Full Body A' },
  { tr: 'Tüm Vücut B', en: 'Full Body B' },
  { tr: 'Tüm Vücut C', en: 'Full Body C' },
  { tr: 'Üst Vücut A', en: 'Upper Body A' },
  { tr: 'Üst Vücut B', en: 'Upper Body B' },
  { tr: 'Alt Vücut A', en: 'Lower Body A' },
  { tr: 'Alt Vücut B', en: 'Lower Body B' },
]
const TEMPLATE_DAY_EN = new Map(TEMPLATE_DAYS.map((x) => [x.tr, x.en]))

function templateEn(program: Pick<WorkoutProgram, 'name' | 'user_id'>, lang: Language) {
  return lang === 'en' && program.user_id === null ? TEMPLATE_EN.get(program.name) : undefined
}

/** Programın görünen adı: hazır şablon İngilizce arayüzde İngilizce. */
export function programTitle(program: Pick<WorkoutProgram, 'name' | 'user_id'>, lang: Language): string {
  return templateEn(program, lang)?.en ?? program.name
}

export function programDescription(program: Pick<WorkoutProgram, 'name' | 'user_id' | 'description'>, lang: Language): string | null {
  return templateEn(program, lang)?.description ?? program.description
}

/** Günün adı; ad boşsa sıra numarasıyla ("Gün 3"). Eşleşmelerde kullanılır (blok etiketi, antrenman adı): dil değişse de aynı kalır. */
export function programDayLabel(day: { day_name: string | null; day_number: number }, t: Translations): string {
  return day.day_name?.trim() || t.wk_day_n.replace('{n}', String(day.day_number))
}

/** Ekranda gösterilen gün adı: hazır şablonun Türkçe gün adı İngilizce arayüzde çevrilir; kullanıcının yazdığı ada dokunulmaz. */
export function programDayDisplay(
  day: { day_name: string | null; day_number: number },
  program: Pick<WorkoutProgram, 'user_id'> | null,
  t: Translations,
  lang: Language,
): string {
  const name = programDayLabel(day, t)
  return lang === 'en' && program?.user_id === null ? (TEMPLATE_DAY_EN.get(name) ?? name) : name
}
