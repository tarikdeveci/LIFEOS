/**
 * Otomatik ilerleme: bir hareketin geçmişine bakıp bir sonraki seansın
 * hedefini (set, tekrar, ağırlık) ve bunun tek cümlelik gerekçesini üretir.
 *
 * Saf fonksiyonlar: veritabanına dokunmaz, saat okumaz. Hedef bir öneridir;
 * kullanıcı ekranda görür, isterse değiştirir.
 *
 * Üç kural:
 * - linear: planda sabit tekrar var (3x8). Planlanan setler tuttuysa ağırlık
 *   bir basamak artar, tutmadıysa aynı kalır; aynı ağırlıkta üst üste 3 kez
 *   tutmadıysa %10 hafifler (deload).
 * - double: tekrar aralığı (8-12). Önce tekrar artar, bütün setler üst sınıra
 *   ulaşınca ağırlık bir basamak artar ve tekrar alt sınıra döner.
 * - bodyweight: ağırlık yoksa tekrarla, 20 tekrardan sonra setle ilerlenir.
 */

import type { MuscleExercise } from './muscles'
import { performedAtTime } from './muscles'

export const ONE_RM_REP_CAP = 12
export const DELOAD_FACTOR = 0.9
export const DELOAD_AFTER_MISSES = 3

export const LOWER_BODY_INCREMENT_KG = 5
export const UPPER_BODY_INCREMENT_KG = 2.5
/** Planda aralık yoksa double progression bu aralıkla çalışır. */
export const DEFAULT_REP_RANGE_MIN = 8
export const DEFAULT_REP_RANGE_MAX = 12
/** Planda set sayısı yoksa ya da geçersizse. */
export const DEFAULT_TARGET_SETS = 3
/** Vücut ağırlığında bu tekrara ulaşınca tekrar yerine set eklenir. */
export const BODYWEIGHT_REP_CEILING = 20
export const MAX_PROGRESSION_SETS = 6

export const FIRST_TIME_REASON = 'İlk kez: rahat bir ağırlıkla başla, tekniği otur.'
export const FIRST_TIME_BODYWEIGHT_REASON = 'İlk kez: tekniği otur, her seti rahat bitir.'

export interface SessionSet {
  reps: number | null
  weight_kg: number | null
  completed: boolean
}

/** Tek hareketin tek seanstaki setleri. */
export interface ExerciseSession {
  performedAt: string
  sets: SessionSet[]
}

export type ProgressionRule = 'first_time' | 'linear' | 'double' | 'bodyweight' | 'deload'

/**
 * Programdaki satır. reps tek başına sabit hedeftir (linear); repMin ile
 * birlikte aralığın üst sınırıdır (double).
 */
export interface ProgressionPlan {
  sets: number
  reps: number | null
  repMin?: number | null
}

export interface ProgressionTarget {
  sets: number
  reps: number
  /** null = ağırlık önerisi yok (ilk seans ya da vücut ağırlığı). */
  weightKg: number | null
  rule: ProgressionRule
  /** Tek cümle, sayıyı açıklar. */
  reason: string
}

// -------------------------------------------------------
// 1RM ve ağırlık basamağı
// -------------------------------------------------------

/**
 * Epley tahmini: w x (1 + r/30), 1 ondalık. 12 tekrarın üstünde formül
 * dayanıklılığı ölçmeye başlar, güvenilmez; o yüzden null.
 */
export function estimate1RM(weightKg: number, reps: number): number | null {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return null
  if (!Number.isFinite(reps) || reps <= 0 || reps > ONE_RM_REP_CAP) return null
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10
}

/** Alt vücut hareketleri 5 kg, diğerleri 2.5 kg basamakla ilerler. */
export function loadIncrementKg(ex: MuscleExercise): number {
  return ex.muscle_group?.body_region === 'lower' ? LOWER_BODY_INCREMENT_KG : UPPER_BODY_INCREMENT_KG
}

/** En yakın basamak katına yuvarlar. */
export function roundToIncrementKg(weightKg: number, incrementKg: number): number {
  if (!(incrementKg > 0)) return weightKg
  return Number((Math.round(weightKg / incrementKg) * incrementKg).toFixed(2))
}

function increased(weightKg: number, incrementKg: number): number {
  const next = roundToIncrementKg(weightKg + incrementKg, incrementKg)
  return next > weightKg ? next : Number((next + incrementKg).toFixed(2))
}

/** Deload ağırlığı; basamak katı ve mevcuttan küçük. İnilecek yer yoksa null. */
function deloaded(weightKg: number, incrementKg: number): number | null {
  let next = roundToIncrementKg(weightKg * DELOAD_FACTOR, incrementKg)
  if (next >= weightKg) next = Number((next - incrementKg).toFixed(2))
  return next > 0 ? next : null
}

/** 62.5 -> "62.5", 60 -> "60"; ondalık ayırıcı nokta. */
function kg(value: number): string {
  return String(Number(value.toFixed(2)))
}

// -------------------------------------------------------
// Seans özeti
// -------------------------------------------------------

interface SessionSummary {
  performedAt: string
  /** Son seansın en çok kullanılan ağırlığı; 0 = ağırlıksız. */
  weight: number
  /** Çalışma ağırlığında (ve üstünde) yapılan tamamlanmış setlerin tekrarları. */
  reps: number[]
}

function positiveInt(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return null
  return Math.round(value)
}

function sameWeight(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01
}

/**
 * Isınma ve geri iniş setleri hafif olduğu için mod ağırlığın altında kalır,
 * sayılmaz. Eşit sıklıkta iki ağırlık varsa ağır olan çalışma ağırlığıdır.
 */
function summarize(session: ExerciseSession): SessionSummary | null {
  const work = session.sets
    .filter((set) => set.completed && typeof set.reps === 'number' && set.reps > 0)
    .map((set) => ({ reps: set.reps as number, weight: set.weight_kg != null && set.weight_kg > 0 ? set.weight_kg : 0 }))
  if (work.length === 0) return null

  const counts = new Map<number, number>()
  for (const set of work) {
    const key = Number(set.weight.toFixed(2))
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let weight = 0
  let best = 0
  for (const [key, count] of counts) {
    if (count > best || (count === best && key > weight)) {
      weight = key
      best = count
    }
  }

  const reps = work.filter((set) => set.weight >= weight - 0.001).map((set) => set.reps)
  return { performedAt: session.performedAt, weight, reps }
}

/**
 * Geçmiş en yeni başta beklenir; yine de tarihe göre sıralanır. Hiç
 * tamamlanmış tekrarlı seti olmayan seans (atlanmış, yarım ya da süreli
 * kayıt) yok sayılır.
 */
function orderedSummaries(history: ExerciseSession[]): SessionSummary[] {
  return history
    .map((session, index) => ({ session, index, time: performedAtTime(session.performedAt) ?? -Infinity }))
    .sort((a, b) => (b.time - a.time) || (a.index - b.index))
    .map(({ session }) => summarize(session))
    .filter((summary): summary is SessionSummary => summary !== null)
}

function countAtLeast(reps: number[], target: number): number {
  return reps.filter((r) => r >= target).length
}

// -------------------------------------------------------
// Kurallar
// -------------------------------------------------------

function bodyweightTarget(last: SessionSummary, planSets: number | null, repFloor: number | null): ProgressionTarget {
  const done = last.reps.length
  const minReps = Math.min(...last.reps)
  const sets = Math.max(planSets ?? 1, done)
  const target = Math.max(repFloor ?? 0, minReps)
  const reached = done >= (planSets ?? 1) && minReps >= target

  if (!reached) {
    const reason = done < (planSets ?? 1)
      ? `Geçen sefer ${done} set yapıldı, ${sets}x${target} hedefini tamamla.`
      : `Geçen sefer en düşük set ${minReps} tekrarda kaldı, ${sets}x${target} hedefinde devam et.`
    return { sets, reps: target, weightKg: null, rule: 'bodyweight', reason }
  }

  if (minReps >= BODYWEIGHT_REP_CEILING) {
    if (sets >= MAX_PROGRESSION_SETS) {
      return {
        sets,
        reps: BODYWEIGHT_REP_CEILING,
        weightKg: null,
        rule: 'bodyweight',
        reason: `Geçen sefer ${done}x${minReps} tamamlandı, daha zor bir varyasyona geç ya da ağırlık ekle.`,
      }
    }
    return {
      sets: sets + 1,
      reps: BODYWEIGHT_REP_CEILING,
      weightKg: null,
      rule: 'bodyweight',
      reason: `Geçen sefer ${done}x${minReps} tamamlandı, bir set ekle: ${sets + 1}x${BODYWEIGHT_REP_CEILING}.`,
    }
  }

  const reps = minReps + 1
  return {
    sets,
    reps,
    weightKg: null,
    rule: 'bodyweight',
    reason: `Geçen sefer ${done}x${minReps} tamamlandı, ${reps} tekrara çık.`,
  }
}

function linearTarget(sessions: SessionSummary[], last: SessionSummary, sets: number, reps: number, incrementKg: number): ProgressionTarget {
  const weight = last.weight
  const hit = (summary: SessionSummary) => countAtLeast(summary.reps, reps) >= sets

  if (hit(last)) {
    const next = increased(weight, incrementKg)
    return {
      sets,
      reps,
      weightKg: next,
      rule: 'linear',
      reason: `Geçen sefer ${sets}x${reps} ${kg(weight)} kg tamamlandı, ${kg(next)} kg'a çık.`,
    }
  }

  // Deload serisi yalnızca aynı ağırlıktaki kaçırmalardan oluşur; deload
  // sonrası hafif ağırlıktaki ilk kaçırma yeni bir deload tetiklemesin.
  let misses = 0
  for (const summary of sessions) {
    if (hit(summary) || !sameWeight(summary.weight, weight)) break
    misses += 1
  }

  if (misses >= DELOAD_AFTER_MISSES) {
    const lighter = deloaded(weight, incrementKg)
    if (lighter !== null) {
      return {
        sets,
        reps,
        weightKg: lighter,
        rule: 'deload',
        reason: `${kg(weight)} kg ile ${misses} seanstır ${sets}x${reps} tutmadı, ${kg(lighter)} kg'a inip yeniden yüklen.`,
      }
    }
  }

  const made = Math.min(sets, countAtLeast(last.reps, reps))
  return {
    sets,
    reps,
    weightKg: weight,
    rule: 'linear',
    reason: `Geçen sefer ${kg(weight)} kg ile ${sets}x${reps} hedefinde ${made}/${sets} set tuttu, aynı ağırlıkta tekrar dene.`,
  }
}

function doubleTarget(last: SessionSummary, planSets: number | null, lo: number, hi: number, incrementKg: number): ProgressionTarget {
  const weight = last.weight
  const sets = planSets ?? Math.min(MAX_PROGRESSION_SETS, last.reps.length)

  if (countAtLeast(last.reps, hi) >= sets) {
    const next = increased(weight, incrementKg)
    return {
      sets,
      reps: lo,
      weightKg: next,
      rule: 'double',
      reason: `Geçen sefer ${sets}x${hi} ${kg(weight)} kg tamamlandı, ${kg(next)} kg'a çık ve ${lo} tekrardan başla.`,
    }
  }

  const minReps = Math.min(...last.reps)
  const reps = Math.min(hi, minReps + 1)
  const reason = reps > minReps
    ? `Geçen sefer ${kg(weight)} kg ile en düşük set ${minReps} tekrardı, ${reps} tekrarı hedefle.`
    : `Geçen sefer ${kg(weight)} kg ile ${last.reps.length} set yapıldı, ${sets}x${hi} hedefini tamamla.`
  return { sets, reps, weightKg: weight, rule: 'double', reason }
}

/**
 * Bir sonraki seansın hedefi. history en yeni başta; bugün süren seans
 * geçmişe verilmemeli, yoksa hedef set tamamlandıkça kayar. Geçmiş de plan da
 * yoksa ya da yalnızca süreli kayıtlar varsa null.
 */
export function nextTarget(
  ex: MuscleExercise,
  history: ExerciseSession[],
  plan: ProgressionPlan | null = null,
): ProgressionTarget | null {
  const planSets = positiveInt(plan?.sets)
  const planReps = positiveInt(plan?.reps)
  const planRepMin = positiveInt(plan?.repMin)

  const sessions = orderedSummaries(history)
  const last = sessions[0]

  if (!last) {
    const reps = planReps ?? planRepMin
    if (!plan || reps === null) return null
    return {
      sets: planSets ?? DEFAULT_TARGET_SETS,
      reps,
      weightKg: null,
      rule: 'first_time',
      reason: ex.is_bodyweight ? FIRST_TIME_BODYWEIGHT_REASON : FIRST_TIME_REASON,
    }
  }

  // Ağırlık girilmemiş yüklü hareket de (lastik, unutulan ağırlık) tekrarla
  // ilerler: olmayan bir ağırlığa basamak eklemek anlamsız.
  if (last.weight <= 0) return bodyweightTarget(last, planSets, planRepMin ?? planReps)

  const incrementKg = loadIncrementKg(ex)
  if (planReps !== null && planRepMin === null) {
    return linearTarget(sessions, last, planSets ?? DEFAULT_TARGET_SETS, planReps, incrementKg)
  }

  const a = planRepMin ?? DEFAULT_REP_RANGE_MIN
  const b = planReps ?? DEFAULT_REP_RANGE_MAX
  return doubleTarget(last, planSets, Math.min(a, b), Math.max(a, b), incrementKg)
}

/**
 * Geçmişteki en iyi tahmini 1RM ve yapıldığı seans. Eşitlikte yeni olan.
 * Vücut ağırlığı hareketlerinde yalnızca eklenen ağırlığı görür.
 */
export function best1RM(history: ExerciseSession[]): { value: number; performedAt: string } | null {
  const ordered = history
    .map((session, index) => ({ session, index, time: performedAtTime(session.performedAt) ?? -Infinity }))
    .sort((a, b) => (b.time - a.time) || (a.index - b.index))

  let best: { value: number; performedAt: string } | null = null
  for (const { session } of ordered) {
    for (const set of session.sets) {
      if (!set.completed || set.weight_kg == null || set.reps == null) continue
      const value = estimate1RM(set.weight_kg, set.reps)
      if (value !== null && (best === null || value > best.value)) best = { value, performedAt: session.performedAt }
    }
  }
  return best
}
