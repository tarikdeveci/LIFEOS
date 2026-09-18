/**
 * Kas dengesi: hangi kas ne kadar çalıştı, hangisi ihmal ediliyor.
 *
 * Saf fonksiyonlar: veritabanına dokunmaz, saat okumaz (now parametre olarak
 * gelir). Girdi, workout_sets satırlarından türetilmiş düz set listesi
 * (LoggedSet); dönüştürme işini store ya da ekran yapar.
 *
 * Bir set ana kasa tam (1.0), yardımcı kaslara kısmi (0.4) sayılır. Böylece
 * bench press göğse bir set, arka kola 0.4 set yazar; yalnızca ana kasa bakan
 * bir sayım arka kolu hiç çalışılmamış gösterirdi.
 */

import type { BodyRegion, Exercise, MuscleGroup } from '../types/workout'
import { shiftIsoDate, toDateString } from './date'

export const PRIMARY_MUSCLE_WEIGHT = 1
export const SECONDARY_MUSCLE_WEIGHT = 0.4

/** Dengeye ve haritaya girmeyen gruplar (name_en). */
export const NON_ANATOMICAL_MUSCLE_GROUPS: readonly string[] = ['Full Body', 'Flexibility', 'Swimming']

/** 'YYYY-MM-DD' biçimindeki (saatsiz) performedAt günün bu saatinde yapılmış sayılır. */
export const DATE_ONLY_PERFORMED_HOUR = 18

export type MuscleExercise = Pick<
  Exercise,
  'id' | 'muscle_group_id' | 'secondary_muscle_group_ids' | 'is_bodyweight' | 'category'
> & { muscle_group?: MuscleGroup | null }

export interface LoggedSet {
  exercise: MuscleExercise
  /** 'YYYY-MM-DD' (workout tarihi) ya da ISO zaman damgası. */
  performedAt: string
  reps: number | null
  weight_kg: number | null
  duration_seconds: number | null
  completed: boolean
}

// -------------------------------------------------------
// Zaman
// -------------------------------------------------------

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * performedAt'in epoch milisaniyesi. Saatsiz tarih yerel 18:00 sayılır:
 * antrenmanın günün hangi saatinde yapıldığını bilmiyoruz, akşam en sık
 * görülen zaman. Okunamayan değer null.
 */
export function performedAtTime(performedAt: string): number | null {
  const dateOnly = DATE_ONLY.exec(performedAt)
  if (dateOnly) {
    const [, y, m, d] = dateOnly
    const date = new Date(Number(y), Number(m) - 1, Number(d), DATE_ONLY_PERFORMED_HOUR)
    // 2026-02-31 gibi taşan tarihleri reddet.
    if (toDateString(date) !== performedAt) return null
    return date.getTime()
  }
  const ms = Date.parse(performedAt)
  return Number.isFinite(ms) ? ms : null
}

/** performedAt'in yerel takvim günü ('YYYY-MM-DD'). Okunamayan değer null. */
export function performedAtDay(performedAt: string): string | null {
  const ms = performedAtTime(performedAt)
  return ms === null ? null : toDateString(new Date(ms))
}

/**
 * Son `days` takvim gününe (bugün dahil) düşen setler. days = 7 ise bugün ve
 * önceki 6 gün. Gelecek tarihli ve okunamayan setler elenir. Tamamlanma
 * durumuna bakmaz; o süzme hesaplayan fonksiyonların işi.
 */
export function setsInWindow(sets: LoggedSet[], days: number, now: Date = new Date()): LoggedSet[] {
  if (Number.isNaN(days) || days < 1) return []
  const today = toDateString(now)
  const from = Number.isFinite(days) ? shiftIsoDate(today, -(Math.floor(days) - 1)) : null
  return sets.filter((set) => {
    const day = performedAtDay(set.performedAt)
    return day !== null && day <= today && (from === null || day >= from)
  })
}

// -------------------------------------------------------
// Kas ağırlıkları
// -------------------------------------------------------

function isMuscleId(id: unknown): id is number {
  return typeof id === 'number' && Number.isInteger(id) && id > 0
}

/**
 * Kas yükü yazmayan kategoriler. "Hamstring Germe"nin ana kası Arka Bacak;
 * sayılsaydı her gün esneyen kullanıcının arka bacağı dengede ihmal edilmemiş,
 * güçte hiç kayıpsız, toparlanmada yorgun görünürdü. Edge tarafındaki kopya:
 * supabase/functions/_shared/ai/muscleLoad.ts (NON_TRAINING_CATEGORIES).
 */
export const NON_TRAINING_CATEGORIES: readonly Exercise['category'][] = ['flexibility', 'mobility']

/**
 * Hareketin kaslara dağılımı: ana kas 1.0, yardımcılar 0.4. Aynı id hem ana
 * hem yardımcı listede geçerse büyük ağırlık kalır. Veritabanından null gelen
 * yardımcı listesi boş sayılır. Esneme/mobilite hareketleri boş döner, böylece
 * denge, yorgunluk ve güç hesaplarının hiçbirine girmez.
 */
export function muscleWeightsOf(ex: MuscleExercise): Record<number, number> {
  const weights: Record<number, number> = {}
  if (NON_TRAINING_CATEGORIES.includes(ex.category)) return weights
  const put = (id: unknown, weight: number) => {
    if (!isMuscleId(id)) return
    weights[id] = Math.max(weights[id] ?? 0, weight)
  }
  const secondary: readonly unknown[] = ex.secondary_muscle_group_ids ?? []
  for (const id of secondary) put(id, SECONDARY_MUSCLE_WEIGHT)
  put(ex.muscle_group_id, PRIMARY_MUSCLE_WEIGHT)
  return weights
}

/** Kas başına etkin set sayısı; yalnızca tamamlanan setler sayılır. */
export function effectiveSetsByMuscle(sets: LoggedSet[]): Record<number, number> {
  const totals: Record<number, number> = {}
  for (const set of sets) {
    if (!set.completed) continue
    for (const [key, weight] of Object.entries(muscleWeightsOf(set.exercise))) {
      const id = Number(key)
      totals[id] = (totals[id] ?? 0) + weight
    }
  }
  // 0.4'lerin toplamı 2.8000000000000003 gibi taşmasın.
  for (const key of Object.keys(totals)) {
    const id = Number(key)
    totals[id] = roundTo(totals[id] ?? 0, 1)
  }
  return totals
}

// -------------------------------------------------------
// Denge
// -------------------------------------------------------

/** 0 = hiç çalışılmadı, 4 = en çok çalışılan kasa yakın. */
export type MuscleLevel = 0 | 1 | 2 | 3 | 4

export interface MuscleBalanceEntry {
  muscleGroup: MuscleGroup
  effectiveSets: number
  level: MuscleLevel
}

export interface MuscleBalance {
  /** Anatomik grupların hepsi (0 dahil), çoktan aza. */
  entries: MuscleBalanceEntry[]
  /** Hiç çalışılmayan ya da en çok çalışılanın %25'inin altında kalanlar, azdan çoğa. */
  neglected: MuscleGroup[]
  /** Listedeki en az bir kasa yazan tamamlanmış set sayısı (ağırlıksız, ham adet). */
  totalSets: number
}

export const NEGLECTED_MUSCLE_RATIO = 0.25

const REGION_ORDER: Record<BodyRegion, number> = { upper: 0, core: 1, lower: 2, full: 3 }

function compareRegion(a: MuscleGroup, b: MuscleGroup): number {
  return (REGION_ORDER[a.body_region] ?? 9) - (REGION_ORDER[b.body_region] ?? 9) || a.id - b.id
}

export function muscleLevelOf(effectiveSets: number, maxSets: number): MuscleLevel {
  if (!(effectiveSets > 0) || !(maxSets > 0)) return 0
  const level = Math.max(1, Math.min(4, Math.ceil((effectiveSets / maxSets) * 4)))
  return level as MuscleLevel
}

/**
 * Verilen setlerin (pencereyi çağıran seçer, bkz. setsInWindow) kaslara
 * dağılımı. Tüm vücut, esneklik ve yüzme gibi anatomik olmayan gruplar listede
 * yer almaz ama bu hareketlerin yardımcı kasları yine sayılır.
 */
export function muscleBalance(sets: LoggedSet[], muscleGroups: MuscleGroup[]): MuscleBalance {
  const groups = new Map<number, MuscleGroup>()
  for (const group of muscleGroups) {
    if (NON_ANATOMICAL_MUSCLE_GROUPS.includes(group.name_en)) continue
    if (!groups.has(group.id)) groups.set(group.id, group)
  }

  const effective = effectiveSetsByMuscle(sets)
  let totalSets = 0
  for (const set of sets) {
    if (!set.completed) continue
    if (Object.keys(muscleWeightsOf(set.exercise)).some((key) => groups.has(Number(key)))) totalSets += 1
  }

  const values = [...groups.values()].map((group) => ({ group, value: effective[group.id] ?? 0 }))
  const max = values.reduce((acc, { value }) => Math.max(acc, value), 0)

  const entries = values
    .map(({ group, value }): MuscleBalanceEntry => ({
      muscleGroup: group,
      effectiveSets: value,
      level: muscleLevelOf(value, max),
    }))
    .sort((a, b) => b.effectiveSets - a.effectiveSets || compareRegion(a.muscleGroup, b.muscleGroup))

  const neglected = totalSets === 0
    ? []
    : entries
      .filter((entry) => entry.effectiveSets === 0 || entry.effectiveSets < max * NEGLECTED_MUSCLE_RATIO)
      .sort((a, b) => a.effectiveSets - b.effectiveSets || compareRegion(a.muscleGroup, b.muscleGroup))
      .map((entry) => entry.muscleGroup)

  return { entries, neglected, totalSets }
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
