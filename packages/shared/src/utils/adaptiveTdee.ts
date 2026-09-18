/**
 * Gerçek kilo değişiminden günlük enerji harcamasını (TDEE) öğrenen filtre.
 *
 * Formül (Mifflin-St Jeor x aktivite çarpanı) kişiyi nüfus ortalamasına
 * oturtur; aynı boy, kilo ve yaştaki iki kişinin harcaması 300 ile 400 kcal
 * ayrışabilir. Burada formül yalnızca başlangıç noktası: kullanıcının yediği
 * ile tartının gösterdiği yan yana konunca harcama kendiliğinden ortaya çıkar.
 *
 * Model: 2 durumlu doğrusal Kalman filtresi, günlük adım.
 *   durum   x = [W, E]   W: trend kilo (kg), E: harcama (kcal/gün)
 *   tahmin  W' = W + (I - E) / 7700,  E' = E      (I: o günün alımı)
 *   ölçüm   z  = W + v                            (v: su ve sindirim dalgalanması)
 *
 * Tartı sabah yapılır varsayılır: gün d'nin tartısı önce ölçüm olarak işlenir,
 * sonra gün d'nin alımıyla d+1 sabahına ilerlenir. Bugünün alımı kullanılmaz,
 * gün henüz bitmedi.
 *
 * Fikir MIT lisanslı cramnivek/adaptive-macro projesinden; kod bağımsız yazıldı.
 */

import { shiftIsoDate } from './date'
import { calculateTDEE, suggestMacrosFromTDEE, type ActivityLevel, type FitnessGoal } from './nutrition'

// ============================
// Sabitler
// ============================

/** 1 kg vücut dokusunun yaklaşık enerji karşılığı (kcal). */
export const KCAL_PER_KG = 7700

/**
 * Tartı gürültüsü (kg, standart sapma). Aynı kişinin sabah tartısı su, tuz,
 * glikojen ve bağırsak içeriğiyle günden güne 0.5 ile 1 kg oynar; 0.6 bandın
 * alt-orta kısmı. Büyütmek filtreyi yavaşlatır, küçültmek tuzlu bir akşam
 * yemeğini harcama değişimi sanmasına yol açar.
 */
export const TDEE_WEIGHT_NOISE_KG = 0.6
export const TDEE_R = TDEE_WEIGHT_NOISE_KG ** 2

/**
 * Alım biliniyorken trend kilonun modelin açıklayamadığı günlük oynaması
 * (kg²). Kayıttaki rastgele hata günde yaklaşık 300 kcal, yani 0.04 kg.
 * Sistematik eksik yazım buraya girmez: o E'ye emilir ve zaten istenen de
 * budur (hedef, kaydedilen alıma göre verilir).
 */
export const TDEE_Q_WEIGHT = 0.04 ** 2

/**
 * Alım bilinmeyen günde (I - E) tamamen belirsiz; tipik günlük açık ya da
 * fazla 750 kcal civarı, yani 0.1 kg. Bu günlerde F = I kullanılır ve kilonun
 * serbestçe kayabilmesi için süreç gürültüsü büyütülür.
 */
export const TDEE_Q_WEIGHT_UNKNOWN = 0.1 ** 2

/**
 * Harcamanın kendi değişim hızı (kcal²/gün). Kilo kaybı, aktivite ve
 * metabolik uyum harcamayı yavaşça kaydırır. Günlük 15 kcal rastgele yürüyüş
 * bir ayda 80 kcal civarı kaymaya izin verir. Daha büyüğü tahmini tartı
 * gürültüsüne boğar ve güven hiç "yüksek"e çıkamaz; daha küçüğü gerçek bir
 * değişimi haftalarca geç yakalar.
 */
export const TDEE_Q_EXPENDITURE = 15 ** 2

/** Başlangıç belirsizliği: kilo ±1 kg, harcama ±400 kcal (formülün kişiler arası saçılımı). */
export const TDEE_P0_WEIGHT = 1
export const TDEE_P0_EXPENDITURE = 400 ** 2

/**
 * Tartı kapısı: tahmine bu kadar sigmadan uzak ölçüm (75 yerine 57 gibi yazım
 * hatası) reddedilir. Art arda iki uç ölçüm birbirine yakınsa yanlış olan
 * filtredir; kilo yeni seviyeye sıfırlanır.
 */
export const TDEE_GATE_SIGMA = 5
const OUTLIER_AGREE_KG = 1.5

/** Öneri eşikleri */
export const TDEE_MIN_DAYS = 14
export const TDEE_MIN_INTAKE_DAYS = 10
export const TDEE_MIN_WEIGH_INS = 4
export const TDEE_MIN_DELTA_KCAL = 100
/** Bunun altına otomatik hedef önerilmez; düşük kalori kararı kullanıcının. */
export const TDEE_MIN_PROPOSAL_KCAL = 1200

/**
 * Bu toplamın altındaki gün "eksik kayıt" sayılır: yalnızca kahvaltısı girilmiş
 * bir gün harcamayı olduğundan düşük gösterir. Eşik max(800, hedefin %50'si).
 */
export const TDEE_MISSING_DAY_FLOOR_KCAL = 800

/** Güven etiketleri sigma_E (kcal) üzerinden */
const SIGMA_LOW = 250
const SIGMA_MEDIUM = 150

/** Olağan harcama aralığı; dışı büyük olasılıkla eksik ya da hatalı kayıt. */
const PLAUSIBLE_MIN_KCAL = 1000
const PLAUSIBLE_MAX_KCAL = 6000

/** Profil hiç yoksa ve hedef de yoksa başlangıç harcaması. */
const FALLBACK_EXPENDITURE = 2000

// ============================
// Tipler
// ============================

export interface WeighIn {
  date: string
  weightKg: number
}

export interface DailyIntake {
  date: string
  kcal: number
}

export type TdeeConfidence = 'low' | 'medium' | 'high'

/** Önerinin neden olmadığı; UI tek cümlelik açıklamayı buradan kurar. */
export type TdeeGap =
  | 'no_weigh_in'
  | 'few_days'
  | 'few_intake_days'
  | 'few_weigh_ins'
  | 'low_confidence'
  | 'implausible'
  | 'below_floor'
  | 'no_change'

export interface TdeeProposal {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  reason: string
}

export interface AdaptiveTdeeInput {
  weighIns: readonly WeighIn[]
  intake: readonly DailyIntake[]
  /** Bugün, kullanıcının yerel günü ('YYYY-MM-DD') */
  endDate: string
  /** Başlangıç harcaması E0 (bkz. initialExpenditureEstimate) */
  initialExpenditure: number
  /** Mevcut kalori hedefi; yoksa null */
  targetCalories: number | null
  goal: FitnessGoal
}

export interface AdaptiveTdeeResult {
  expenditure: number
  low: number
  high: number
  sigma: number
  trendWeightKg: number | null
  weeklyRateKg: number | null
  daysTracked: number
  intakeDays: number
  weighIns: number
  confidence: TdeeConfidence
  proposal: TdeeProposal | null
  gap: TdeeGap | null
  /** Gün gün filtrelenmiş trend kilo */
  trend: Array<{ date: string; weightKg: number }>
}

export interface TdeeProfile {
  weight_kg: number | null
  height_cm: number | null
  age: number | null
  gender: 'male' | 'female' | null
  activity_level: ActivityLevel | null
  goal: FitnessGoal
}

// ============================
// 2x2 matris yardımcıları (satır öncelikli: [a, b, c, d] = [[a, b], [c, d]])
// ============================

type Mat2 = readonly [number, number, number, number]

function mul(a: Mat2, b: Mat2): Mat2 {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
  ]
}

function transpose(a: Mat2): Mat2 {
  return [a[0], a[2], a[1], a[3]]
}

function add(a: Mat2, b: Mat2): Mat2 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]]
}

/** Yuvarlama birikimi P'yi asimetrik yapmasın */
function symmetrize(p: Mat2): Mat2 {
  const off = (p[1] + p[2]) / 2
  return [p[0], off, off, p[3]]
}

interface FilterState {
  w: number
  e: number
  p: Mat2
}

/** Gün sonu tahmini: alım biliniyorsa enerji dengesi, bilinmiyorsa F = I. */
function predict(s: FilterState, intakeKcal: number | null): FilterState {
  if (intakeKcal === null) {
    const q: Mat2 = [TDEE_Q_WEIGHT_UNKNOWN, 0, 0, TDEE_Q_EXPENDITURE]
    return { w: s.w, e: s.e, p: symmetrize(add(s.p, q)) }
  }
  const f: Mat2 = [1, -1 / KCAL_PER_KG, 0, 1]
  const q: Mat2 = [TDEE_Q_WEIGHT, 0, 0, TDEE_Q_EXPENDITURE]
  return {
    w: s.w + (intakeKcal - s.e) / KCAL_PER_KG,
    e: s.e,
    p: symmetrize(add(mul(mul(f, s.p), transpose(f)), q)),
  }
}

/**
 * Tartı ölçüm güncellemesi, H = [1, 0]. Joseph formu:
 * P = (I - KH) P (I - KH)^T + K R K^T. Klasik (I - KH) P'ye göre biraz daha
 * pahalı ama yuvarlama hatasında P simetrik ve pozitif tanımlı kalır.
 */
function update(s: FilterState, z: number): FilterState {
  const innovationVar = s.p[0] + TDEE_R
  const k0 = s.p[0] / innovationVar
  const k1 = s.p[2] / innovationVar
  const innovation = z - s.w
  const a: Mat2 = [1 - k0, 0, -k1, 1]
  const krk: Mat2 = [k0 * k0 * TDEE_R, k0 * k1 * TDEE_R, k1 * k0 * TDEE_R, k1 * k1 * TDEE_R]
  return {
    w: s.w + k0 * innovation,
    e: s.e + k1 * innovation,
    p: symmetrize(add(mul(mul(a, s.p), transpose(a)), krk)),
  }
}

// ============================
// Ana hesap
// ============================

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step
}

function formatKg(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1).replace('.', ',')
}

function confidenceFromSigma(sigma: number): TdeeConfidence {
  if (sigma > SIGMA_LOW) return 'low'
  if (sigma > SIGMA_MEDIUM) return 'medium'
  return 'high'
}

/** Aynı güne birden fazla değer geldiyse sonuncusu geçerli; geçersizler atılır. */
function indexWeighIns(weighIns: readonly WeighIn[], endDate: string): Map<string, number> {
  const map = new Map<string, number>()
  for (const w of weighIns) {
    if (w.date > endDate) continue
    if (!Number.isFinite(w.weightKg) || w.weightKg < 20 || w.weightKg > 400) continue
    map.set(w.date, w.weightKg)
  }
  return map
}

function indexIntake(intake: readonly DailyIntake[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const d of intake) {
    if (!Number.isFinite(d.kcal) || d.kcal < 0) continue
    map.set(d.date, (map.get(d.date) ?? 0) + d.kcal)
  }
  return map
}

/**
 * Kilo ve alım geçmişinden harcamayı tahmin eder, uygunsa hedef önerir.
 * Saf fonksiyon: ağ, saat ya da depolama okumaz.
 */
export function computeAdaptiveTdee(input: AdaptiveTdeeInput): AdaptiveTdeeResult {
  const e0 = Number.isFinite(input.initialExpenditure) && input.initialExpenditure > 0
    ? input.initialExpenditure
    : FALLBACK_EXPENDITURE
  const weights = indexWeighIns(input.weighIns, input.endDate)
  const intake = indexIntake(input.intake)
  const referenceKcal = input.targetCalories && input.targetCalories > 0 ? input.targetCalories : e0
  const missingThreshold = Math.max(TDEE_MISSING_DAY_FLOOR_KCAL, referenceKcal * 0.5)

  const startDate = [...weights.keys()].sort()[0]
  if (startDate === undefined) {
    const sigma = Math.sqrt(TDEE_P0_EXPENDITURE)
    return {
      expenditure: roundTo(e0, 10),
      low: roundTo(e0 - 1.96 * sigma, 10),
      high: roundTo(e0 + 1.96 * sigma, 10),
      sigma: Math.round(sigma),
      trendWeightKg: null,
      weeklyRateKg: null,
      daysTracked: 0,
      intakeDays: 0,
      weighIns: 0,
      confidence: 'low',
      proposal: null,
      gap: 'no_weigh_in',
      trend: [],
    }
  }

  // İlk tartı başlangıç noktası; aynı ölçümü ikinci kez güncelleme olarak
  // işlemek belirsizliği olduğundan küçük gösterirdi.
  let state: FilterState = {
    w: weights.get(startDate) ?? 0,
    e: e0,
    p: [TDEE_P0_WEIGHT, 0, 0, TDEE_P0_EXPENDITURE],
  }
  let weighInCount = 1
  let intakeDays = 0
  let intakeSum = 0
  let daysTracked = 0
  let pendingOutlier: number | null = null
  const trend: Array<{ date: string; weightKg: number }> = []

  for (let date = startDate; date <= input.endDate; date = shiftIsoDate(date, 1)) {
    daysTracked += 1
    const z = date === startDate ? undefined : weights.get(date)

    if (z !== undefined) {
      const innovation = z - state.w
      const gate = TDEE_GATE_SIGMA * Math.sqrt(state.p[0] + TDEE_R)
      if (Math.abs(innovation) <= gate) {
        state = update(state, z)
        weighInCount += 1
        pendingOutlier = null
      } else if (pendingOutlier !== null && Math.abs(z - pendingOutlier) <= OUTLIER_AGREE_KG) {
        // İki uç ölçüm birbirini doğruluyor: yanlış olan filtrenin kilosu.
        state = { w: z, e: state.e, p: [Math.max(state.p[0], TDEE_P0_WEIGHT), 0, 0, state.p[3]] }
        weighInCount += 1
        pendingOutlier = null
      } else {
        pendingOutlier = z
      }
    }

    trend.push({ date, weightKg: Math.round(state.w * 100) / 100 })

    if (date < input.endDate) {
      const kcal = intake.get(date)
      const known = kcal !== undefined && kcal >= missingThreshold
      if (known) {
        intakeDays += 1
        intakeSum += kcal
      }
      state = predict(state, known ? kcal : null)
    }
  }

  const sigma = Math.sqrt(Math.max(0, state.p[3]))
  const expenditure = roundTo(state.e, 10)
  const confidence = confidenceFromSigma(sigma)

  // Haftalık hız: son en çok 14 günün trend farkı; 7 günden kısa aralıkta yorum yok.
  const lastPoint = trend[trend.length - 1]
  const refIndex = Math.max(0, trend.length - 1 - 14)
  const refPoint = trend[refIndex]
  const span = trend.length - 1 - refIndex
  const weeklyRateKg =
    lastPoint && refPoint && span >= 7
      ? Math.round(((lastPoint.weightKg - refPoint.weightKg) / span) * 7 * 100) / 100
      : null

  const base: AdaptiveTdeeResult = {
    expenditure,
    low: roundTo(state.e - 1.96 * sigma, 10),
    high: roundTo(state.e + 1.96 * sigma, 10),
    sigma: Math.round(sigma),
    trendWeightKg: Math.round(state.w * 10) / 10,
    weeklyRateKg,
    daysTracked,
    intakeDays,
    weighIns: weighInCount,
    confidence,
    proposal: null,
    gap: null,
    trend,
  }

  const gap = proposalGap(base, input)
  if (gap !== null) return { ...base, gap }

  const macros = suggestMacrosFromTDEE(expenditure, input.goal)
  if (macros.calories < TDEE_MIN_PROPOSAL_KCAL) return { ...base, gap: 'below_floor' }
  if (input.targetCalories !== null && Math.abs(macros.calories - input.targetCalories) < TDEE_MIN_DELTA_KCAL) {
    return { ...base, gap: 'no_change' }
  }

  const avgIntake = roundTo(intakeSum / intakeDays, 10)
  const rate = weeklyRateKg ?? 0
  const rateText = Math.abs(rate) < 0.05
    ? 'trend kilon sabit kaldı'
    : `trend kilon haftada ${formatKg(Math.abs(rate))} kg ${rate < 0 ? 'düştü' : 'arttı'}`

  return {
    ...base,
    proposal: {
      calories: macros.calories,
      protein_g: macros.protein_g,
      carbs_g: macros.carbs_g,
      fat_g: macros.fat_g,
      reason: `Son ${daysTracked} günde ortalama ${avgIntake} kcal aldın ve ${rateText}, gerçek harcaman yaklaşık ${expenditure} kcal.`,
    },
  }
}

function proposalGap(r: AdaptiveTdeeResult, input: AdaptiveTdeeInput): TdeeGap | null {
  if (r.weighIns === 0) return 'no_weigh_in'
  if (r.daysTracked < TDEE_MIN_DAYS) return 'few_days'
  if (r.intakeDays < TDEE_MIN_INTAKE_DAYS) return 'few_intake_days'
  if (r.weighIns < TDEE_MIN_WEIGH_INS) return 'few_weigh_ins'
  if (r.expenditure < PLAUSIBLE_MIN_KCAL || r.expenditure > PLAUSIBLE_MAX_KCAL) return 'implausible'
  if (r.confidence === 'low') return 'low_confidence'
  if (!Number.isFinite(input.initialExpenditure)) return 'low_confidence'
  return null
}

// ============================
// Başlangıç tahmini
// ============================

const ACTIVITY_KEYS: readonly ActivityLevel[] = [
  'sedentary',
  'lightly_active',
  'moderately_active',
  'very_active',
  'extra_active',
]

function positiveNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? Number.parseFloat(value.replace(',', '.')) : value
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

/**
 * user_profiles.preferences JSONB'sinden TDEE profilini çıkarır.
 * Mobil 'weight_loss', web 'fat_loss' yazıyor; ikisi de yağ kaybı sayılır.
 */
export function profileFromPreferences(preferences: unknown): TdeeProfile {
  const p = (preferences && typeof preferences === 'object' ? preferences : {}) as Record<string, unknown>
  const activity = p['activity_level']
  const goalRaw = p['fitness_goal']
  const goal: FitnessGoal =
    goalRaw === 'weight_loss' || goalRaw === 'fat_loss'
      ? 'fat_loss'
      : goalRaw === 'muscle_gain'
        ? 'muscle_gain'
        : 'general'

  return {
    weight_kg: positiveNumber(p['body_weight_kg']) ?? positiveNumber(p['weight_kg']),
    height_cm: positiveNumber(p['height_cm']),
    age: positiveNumber(p['age']),
    gender: p['gender'] === 'female' ? 'female' : p['gender'] === 'male' ? 'male' : null,
    activity_level: ACTIVITY_KEYS.includes(activity as ActivityLevel) ? (activity as ActivityLevel) : null,
    goal,
  }
}

/**
 * E0: profil tamsa Mifflin-St Jeor; değilse mevcut hedeften geri hesap
 * (yağ kaybı hedefi TDEE'nin %80'i olduğu için hedef / 0.8); o da yoksa 2000.
 * Güncel kilo varsa profildeki eski kilo yerine o kullanılır.
 */
export function initialExpenditureEstimate(
  profile: TdeeProfile | null,
  targetCalories: number | null,
  latestWeightKg: number | null = null,
): number {
  const weight = latestWeightKg ?? profile?.weight_kg ?? null
  if (profile && weight && profile.height_cm && profile.age && profile.gender) {
    return calculateTDEE({
      weight_kg: weight,
      height_cm: profile.height_cm,
      age: profile.age,
      gender: profile.gender,
      activity_level: profile.activity_level ?? 'moderately_active',
    })
  }
  if (targetCalories && targetCalories > 0) {
    const goalFactor = suggestMacrosFromTDEE(1000, profile?.goal ?? 'general').calories / 1000
    return Math.round(targetCalories / goalFactor)
  }
  return FALLBACK_EXPENDITURE
}
