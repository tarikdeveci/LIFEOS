/**
 * Yorgunluk ve güç kaybı: kas bugün dinlenmiş mi, uzun aradan sonra ne kadar
 * güç kaybetmiş olabilir.
 *
 * Saf fonksiyonlar: veritabanına dokunmaz, saat okumaz (now parametre olarak
 * gelir). Değerler bir tahmin; tıbbi ölçüm değil, ekranda yön göstermek için.
 *
 * Yorgunluk modeli: her seans kasa bir uyarı bırakır, uyarı 36 saatlik yarı
 * ömürle söner. Uyarı kişinin kendi seviyesine göre normalize edilir: 20 kg
 * ile çalışan biri için ağır seans, 100 kg ile çalışanınkiyle aynı yorgunluğu
 * göstersin. Birikim 1 - e^(-x) ile 0..1 aralığına sıkıştırılır, her gün
 * ağır antrenmanda bile 1'i geçmez.
 */

import type { LoggedSet } from './muscles'
import { muscleWeightsOf, performedAtDay, performedAtTime } from './muscles'
import { estimate1RM } from './progression'
import { fromDateString, toDateString } from './date'

export const FATIGUE_HALF_LIFE_HOURS = 36
export const FATIGUE_READY_BELOW = 0.25
export const FATIGUE_FATIGUED_ABOVE = 0.5
export const STRENGTH_FULL_DAYS = 14
export const STRENGTH_HALF_LIFE_DAYS = 28
export const STRENGTH_FLOOR = 0.5
export const BODYWEIGHT_FALLBACK_KG = 75

/** Yorgunluk hesabının geriye baktığı süre; 30 gün önceki seans zaten sönmüştür. */
export const FATIGUE_WINDOW_DAYS = 30
/**
 * Güç hesabının istediği geçmiş. Eğri 42. günde tabana iner; 60 gün, tabana
 * inmiş kasın son çalışıldığı günü de gösterir. muscleRetention'a en az bu
 * kadar geçmiş verilmeli, yoksa 30 gün önce çalışılan kas hiç çalışılmamış görünür.
 */
export const RETENTION_WINDOW_DAYS = 60
/** Kas başına başlangıç referans uyarısı (kg x tekrar); normalize bunun oranıdır. */
export const FATIGUE_REFERENCE_LOAD = 2000
/** Süreli (tekrarsız) setlerin dakika başına yükü. */
export const TIMED_SET_LOAD_PER_MINUTE = 50
/** Yükü okunamayan setin varsayılan yükü: referansın üçte biri, orta zorlukta bir set. */
export const UNKNOWN_SET_LOAD = FATIGUE_REFERENCE_LOAD / 3
/** Hafif setin (1RM'ye göre) etkisini azaltan üs. */
export const FATIGUE_INTENSITY_EXPONENT = 1.5

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

export type FatigueState = 'ready' | 'recovering' | 'fatigued'

export interface MuscleFatigue {
  /** 0..1 */
  value: number
  state: FatigueState
}

export function fatigueStateOf(value: number): FatigueState {
  if (!(value >= FATIGUE_READY_BELOW)) return 'ready'
  return value <= FATIGUE_FATIGUED_ABOVE ? 'recovering' : 'fatigued'
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

function decay(elapsedMs: number): number {
  return 0.5 ** (Math.max(0, elapsedMs) / HOUR_MS / FATIGUE_HALF_LIFE_HOURS)
}

// -------------------------------------------------------
// Yorgunluk
// -------------------------------------------------------

/**
 * Setin ham yükü. Süreli setler dakika x 50. Diğerlerinde yük kg x tekrar;
 * vücut ağırlığı hareketlerinde kişinin kilosu eklenir. Yüklü hareketlerde
 * aynı seanstaki en iyi 1RM'ye göre hafif setler (ısınma) az sayılır.
 */
function setLoad(set: LoggedSet, sessionBest1RM: number | null, bodyWeightKg: number): number {
  let load: number
  if (set.reps == null && set.duration_seconds != null) {
    load = (set.duration_seconds / 60) * TIMED_SET_LOAD_PER_MINUTE
  } else {
    const loadKg = set.exercise.is_bodyweight ? bodyWeightKg + (set.weight_kg ?? 0) : (set.weight_kg ?? 0)
    load = loadKg * (set.reps ?? 0)
    if (!set.exercise.is_bodyweight && sessionBest1RM !== null && sessionBest1RM > 0) {
      load *= Math.min(1, loadKg / sessionBest1RM) ** FATIGUE_INTENSITY_EXPONENT
    }
  }
  return Number.isFinite(load) && load > 0 ? load : UNKNOWN_SET_LOAD
}

interface TimedSet {
  set: LoggedSet
  day: string
  time: number
}

interface Session {
  time: number
  stimulus: Map<number, number>
}

/**
 * Kas başına yorgunluk. Yalnızca son 30 gündeki tamamlanmış setler okunur.
 * Saatsiz tarih o günün 18:00'i sayılır; bugünün seansı henüz 18:00 olmadıysa
 * şimdiye çekilir. Hiç seti olmayan kas sonuçta yer almaz, UI onu 0 sayar.
 */
export function muscleFatigue(
  sets: LoggedSet[],
  now: Date = new Date(),
  opts: { bodyWeightKg?: number | null } = {},
): Record<number, MuscleFatigue> {
  const nowMs = now.getTime()
  const today = toDateString(now)
  const since = nowMs - FATIGUE_WINDOW_DAYS * DAY_MS
  const bodyWeightKg = typeof opts.bodyWeightKg === 'number' && Number.isFinite(opts.bodyWeightKg) && opts.bodyWeightKg > 0
    ? opts.bodyWeightKg
    : BODYWEIGHT_FALLBACK_KG

  const timed: TimedSet[] = []
  for (const set of sets) {
    if (!set.completed) continue
    const raw = performedAtTime(set.performedAt)
    if (raw === null) continue
    const day = toDateString(new Date(raw))
    const time = Math.min(raw, nowMs)
    if (day > today || time <= since) continue
    timed.push({ set, day, time })
  }

  // Seans = aynı gün. Önce her hareketin o günkü en iyi 1RM'si.
  const best1RM = new Map<string, number>()
  for (const { set, day } of timed) {
    if (set.weight_kg == null || set.reps == null) continue
    const estimate = estimate1RM(set.weight_kg, set.reps)
    const key = `${day}|${set.exercise.id}`
    if (estimate !== null && estimate > (best1RM.get(key) ?? 0)) best1RM.set(key, estimate)
  }

  const sessions = new Map<string, Session>()
  for (const { set, day, time } of timed) {
    const session = sessions.get(day) ?? { time, stimulus: new Map<number, number>() }
    session.time = Math.max(session.time, time)
    const load = setLoad(set, best1RM.get(`${day}|${set.exercise.id}`) ?? null, bodyWeightKg)
    for (const [key, weight] of Object.entries(muscleWeightsOf(set.exercise))) {
      const id = Number(key)
      session.stimulus.set(id, (session.stimulus.get(id) ?? 0) + load * weight)
    }
    sessions.set(day, session)
  }

  // Referans yalnızca aşağı iner ve seans önce O ANKİ referansa bölünür:
  // hafif çalışan birinin referansı ona yaklaşır, ama ağır bir seans kendi
  // skorunu referansı yükselterek seyreltemez.
  const perMuscle = new Map<number, { ref: number; total: number; lastTime: number }>()
  for (const session of [...sessions.values()].sort((a, b) => a.time - b.time)) {
    for (const [id, stimulus] of session.stimulus) {
      const state = perMuscle.get(id)
      const ref = state?.ref ?? FATIGUE_REFERENCE_LOAD
      const carried = state ? state.total * decay(session.time - state.lastTime) : 0
      perMuscle.set(id, {
        ref: Math.min(ref, ref + (stimulus - ref) / 3),
        total: carried + stimulus / ref,
        lastTime: session.time,
      })
    }
  }

  const result: Record<number, MuscleFatigue> = {}
  for (const [id, { total, lastTime }] of perMuscle) {
    const value = round3(1 - Math.exp(-total * decay(nowMs - lastTime)))
    result[id] = { value, state: fatigueStateOf(value) }
  }
  return result
}

// -------------------------------------------------------
// Güç kaybı
// -------------------------------------------------------

export interface MuscleRetention {
  /** STRENGTH_FLOOR..1; 1 = kayıp yok. */
  value: number
  /** Son çalışılan gün, 'YYYY-MM-DD'. */
  lastTrainedAt: string | null
  daysSince: number | null
}

/** Hiç çalışılmamış kasın değeri; kasın listede olmadığı yerde UI bunu kullanabilir. */
export const UNTRAINED_RETENTION: Readonly<MuscleRetention> = Object.freeze({
  value: STRENGTH_FLOOR,
  lastTrainedAt: null,
  daysSince: null,
})

/** İlk 14 gün tam güç, sonra 28 günlük yarı ömür, 0.5 tabanı (42. gün). */
export function strengthRetentionOf(daysSince: number): number {
  if (!Number.isFinite(daysSince)) return STRENGTH_FLOOR
  if (daysSince <= STRENGTH_FULL_DAYS) return 1
  return round3(Math.max(STRENGTH_FLOOR, 0.5 ** ((daysSince - STRENGTH_FULL_DAYS) / STRENGTH_HALF_LIFE_DAYS)))
}

/**
 * Kas başına güç koruma oranı. Kasın ağırlığı sıfırdan büyük son tamamlanmış
 * setin gününe bakar (yardımcı kas da çalışmış sayılır). Setlerde geçip hiç
 * tamamlanmamış kaslar UNTRAINED_RETENTION değeriyle gelir. Pencere yok:
 * uzun geçmişi (en az RETENTION_WINDOW_DAYS) çağıran verir.
 */
export function muscleRetention(sets: LoggedSet[], now: Date = new Date()): Record<number, MuscleRetention> {
  const today = toDateString(now)
  const lastDay = new Map<number, string>()
  const seen = new Set<number>()

  for (const set of sets) {
    const weights = Object.entries(muscleWeightsOf(set.exercise))
    for (const [key] of weights) seen.add(Number(key))
    if (!set.completed) continue
    const day = performedAtDay(set.performedAt)
    if (day === null || day > today) continue
    for (const [key, weight] of weights) {
      const id = Number(key)
      if (weight <= 0) continue
      const previous = lastDay.get(id)
      if (previous === undefined || day > previous) lastDay.set(id, day)
    }
  }

  const todayMs = fromDateString(today).getTime()
  const result: Record<number, MuscleRetention> = {}
  for (const id of seen) {
    const day = lastDay.get(id)
    if (day === undefined) {
      result[id] = { ...UNTRAINED_RETENTION }
      continue
    }
    // Takvim günü farkı; yaz saati geçişinde 23/25 saatlik gün yuvarlanır.
    const daysSince = Math.round((todayMs - fromDateString(day).getTime()) / DAY_MS)
    result[id] = { value: strengthRetentionOf(daysSince), lastTrainedAt: day, daysSince }
  }
  return result
}
