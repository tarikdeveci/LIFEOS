/**
 * Ekipmana göre süzme, program uyumu ve program uyarlama.
 *
 * Saf fonksiyonlar: veritabanına yazmaz. Uyarlama bir PLAN üretir (hangi satır
 * kalır, hangisi neyle değişir, hangisi düşer); kullanıcıya önce bu plan
 * gösterilir, yazma işini store yapar. Böylece "neden bu hareket değişti"
 * sorusunun cevabı kaydetmeden önce görünür.
 *
 * Seçim anlamı: `null` = kullanıcı hiç seçmedi, uygulama bugünkü gibi tam
 * salon varsayar ve hiçbir şey süzülmez. `[]` = yalnızca vücut ağırlığı.
 */

import type {
  AiProgramPlan,
  EquipmentKey,
  Exercise,
  ProgramDay,
  ProgramExercise,
  WorkoutProgram,
} from '../types/workout'

export type OwnedEquipment = readonly EquipmentKey[]

type EquipmentAware = Pick<Exercise, 'equipment'>

/**
 * Hareketi yapmak için eksik olan aletler. Hareketin ekipmanı bilinmiyorsa
 * (null) ya da kullanıcı seçim yapmamışsa boş döner: bilmediğimiz bir şeyi
 * gizlemek, göstermekten daha kötü.
 */
export function missingEquipment(exercise: EquipmentAware, owned: OwnedEquipment | null): EquipmentKey[] {
  if (owned === null || exercise.equipment == null) return []
  return exercise.equipment.filter((key) => !owned.includes(key))
}

export function isExerciseAvailable(exercise: EquipmentAware, owned: OwnedEquipment | null): boolean {
  return missingEquipment(exercise, owned).length === 0
}

export interface ProgramEquipmentFit {
  /** Programdaki hareket satırı sayısı. */
  total: number
  /** Eldeki aletlerle yapılabilen satır sayısı. */
  available: number
  /** Yapılamayan satırları engelleyen aletler, tekrarsız. */
  missing: EquipmentKey[]
}

export function programEquipmentFit(program: WorkoutProgram, owned: OwnedEquipment | null): ProgramEquipmentFit {
  let total = 0
  let available = 0
  const missing = new Set<EquipmentKey>()

  for (const day of program.days ?? []) {
    for (const row of day.exercises ?? []) {
      total += 1
      const lacking = row.exercise ? missingEquipment(row.exercise, owned) : []
      if (lacking.length === 0) available += 1
      for (const key of lacking) missing.add(key)
    }
  }

  return { total, available, missing: [...missing] }
}

// -------------------------------------------------------
// İkame
// -------------------------------------------------------

// Hareket kalıpları İngilizce addan (name_en) çıkarılıyor: katalogdaki global
// hareketlerin hepsinde var ve Türkçe adlardan daha tutarlı. Sıra önemli, ilk
// eşleşen kazanır: "Glute Kickback" triceps kickback'ten, "Upright Row" row'dan,
// "Close Grip Bench" bench press'ten, "Rowing Machine" row'dan önce gelmeli.
const MOVEMENT_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/treadmill|running|jog/, 'run'],
  [/walking|hiking|stair|elliptical/, 'walk'],
  [/cycling|bike/, 'cycle'],
  [/rowing machine|jump rope|burpee|mountain climber|hiit|tabata/, 'interval'],
  [/swim|stroke|aqua|water walking/, 'swim'],
  [/calf/, 'calf'],
  [/glute kickback|hip thrust|glute bridge|hip abduction|hip adduction/, 'bridge'],
  [/leg curl|nordic/, 'knee_flexion'],
  [/leg extension/, 'knee_extension'],
  [/deadlift|good morning|hyperextension|swing/, 'hinge'],
  [/squat|lunge|leg press|step up|box jump/, 'squat'],
  [/tricep|pushdown|skull crusher|close grip bench|diamond push|tate press|overhead extension/, 'triceps'],
  [/\bdips?\b/, 'dip'],
  [/rear delt|face pull/, 'rear_delt'],
  [/lateral raise|front raise|upright row/, 'raise'],
  [/shoulder press|overhead press|arnold|pike push|handstand push|standing dumbbell press/, 'vertical_push'],
  [/pullover/, 'pullover'],
  [/fly|crossover|pec deck/, 'fly'],
  [/bench press|chest press|push up|hex press|squeeze press|landmine press|planche/, 'horizontal_push'],
  [/pulldown|pull up|chin up|muscle up|front lever/, 'vertical_pull'],
  [/\brow\b/, 'horizontal_pull'],
  [/shrug/, 'shrug'],
  [/curl/, 'elbow_flexion'],
  [/crunch|rollout|leg raise|l sit|dragon flag|hollow|dead bug/, 'core_flexion'],
  [/plank|pallof|wood chop|rotary torso|russian twist|bird dog|superman/, 'core_stability'],
]

// Birbirinin zayıf yerine geçebilen kalıplar. Tam eşleşme yoksa bunlara
// düşülür: barfiks barı olmayan birine kürek çekme, dambılı olmayana köprü.
const RELATED_PATTERNS: Record<string, readonly string[]> = {
  hinge: ['bridge', 'knee_flexion'],
  bridge: ['hinge'],
  knee_flexion: ['hinge', 'bridge'],
  knee_extension: ['squat'],
  squat: ['knee_extension'],
  vertical_pull: ['horizontal_pull', 'pullover'],
  horizontal_pull: ['vertical_pull'],
  horizontal_push: ['fly', 'dip', 'vertical_push'],
  dip: ['triceps', 'horizontal_push'],
  triceps: ['dip'],
  fly: ['horizontal_push', 'pullover'],
  pullover: ['fly', 'vertical_pull'],
  vertical_push: ['horizontal_push', 'raise'],
  raise: ['vertical_push'],
  rear_delt: ['horizontal_pull'],
  run: ['walk', 'interval'],
  walk: ['run', 'cycle'],
  cycle: ['walk'],
  interval: ['run'],
  core_flexion: ['core_stability'],
  core_stability: ['core_flexion'],
}

type NamedExercise = Pick<Exercise, 'name' | 'name_en'>

function englishText(exercise: NamedExercise): string {
  return (exercise.name_en ?? exercise.name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function movementPattern(exercise: NamedExercise): string | null {
  const text = englishText(exercise)
  for (const [pattern, tag] of MOVEMENT_PATTERNS) {
    if (pattern.test(text)) return tag
  }
  return null
}

// Aletin adı hareketin kendisi değil: "Dumbbell Goblet Squat" ile "Goblet
// Squat" aynı hareket, aynı günde ikisi birden çıkmamalı.
const EQUIPMENT_WORDS = new Set(['dumbbell', 'barbell', 'cable', 'machine', 'smith', 'kettlebell', 'band', 'trap', 'bar', 'ez'])

// Ana hareketi değiştiren varyant sözcükleri. Hedefte yoksa adayda olması
// küçük bir ceza: "Bench Press" yerine düz dambıl press, decline değil;
// "Squat" yerine goblet squat, split squat ya da duvarda bekleme değil.
const VARIANT_WORDS = new Set([
  'incline', 'decline', 'close', 'wide', 'reverse', 'single', 'alternating', 'cross', 'split',
  'bulgarian', 'sumo', 'deficit', 'pause', 'jump', 'elevated', 'hold', 'wall', 'sit',
])

// Yıllarca çalışma isteyen beceri hareketleri. Hedef de bunlardan biri değilse
// hiç önerilmez: bench press yapan birine alet yok diye planche önermek,
// programı uygulanamaz hale getirir. Düşen satır, yapılamayan satırdan iyidir.
const ADVANCED_PATTERN = /planche|handstand|one arm|pistol|muscle up|front lever|dragon flag|\bl sit\b/

function movementTokens(exercise: NamedExercise): string[] {
  return englishText(exercise).split(' ').filter((token) => token && !EQUIPMENT_WORDS.has(token))
}

/** Aynı günde tekrar sayılacak anahtar: aletsiz İngilizce ad, yoksa Türkçe ad. */
function movementKey(exercise: NamedExercise): string {
  return exercise.name_en ? movementTokens(exercise).join(' ') : exercise.name.trim().toLocaleLowerCase('tr')
}

function nameSimilarity(target: NamedExercise, candidate: NamedExercise): number {
  const targetTokens = new Set(movementTokens(target))
  let score = 0
  for (const token of new Set(movementTokens(candidate))) {
    if (targetTokens.has(token)) score += 0.25
    else if (VARIANT_WORDS.has(token)) score -= 0.25
  }
  return score
}

const TRAINING_CATEGORIES = new Set<Exercise['category']>(['strength', 'cardio'])

/**
 * Eldeki aletlerle yapılabilen en yakın hareketi bulur, yoksa null.
 *
 * Puan: aynı hareket kalıbı 4, akraba kalıp 1, aynı ana kas 2. Yüklü bir
 * hareketin yerine yüklü olan tercih edilir (+0.5): dambılı olan birine
 * barbell squat yerine goblet squat, jump squat değil. Ad benzerliği eşitliği
 * bozar (ortak sözcük +0.25, hedefte olmayan varyant sözcüğü -0.25). Kalıp
 * birebir tutması kastan ağır basar: paralel bar yoksa dips yerine sehpada
 * dips, dambıl press değil. Kalıbı çıkarılamayan
 * hareketlerde (kullanıcının kendi eklediği Türkçe adlı hareketler) yalnızca
 * aynı ana kas yeterli sayılır.
 *
 * Ekipmanı bilinmeyen (null) adaylar hiç önerilmez: "yapılabilir" diye
 * önerdiğimiz şeyin gerçekten yapılabilir olduğunu bilmemiz gerekir.
 */
export function findSubstitute(
  target: Exercise,
  catalog: readonly Exercise[],
  owned: OwnedEquipment,
  exclude: { ids?: ReadonlySet<string>; movements?: ReadonlySet<string> } = {},
): Exercise | null {
  const targetPattern = movementPattern(target)
  const related = targetPattern ? RELATED_PATTERNS[targetPattern] ?? [] : []
  const targetLoaded = (target.equipment?.length ?? 0) > 0
  const targetAdvanced = ADVANCED_PATTERN.test(englishText(target))

  let best: { exercise: Exercise; score: number } | null = null

  for (const candidate of catalog) {
    if (candidate.id === target.id || candidate.equipment == null) continue
    if (exclude.ids?.has(candidate.id) || exclude.movements?.has(movementKey(candidate))) continue
    if (!isExerciseAvailable(candidate, owned)) continue
    if (!targetAdvanced && ADVANCED_PATTERN.test(englishText(candidate))) continue

    const sameCategory = candidate.category === target.category
    const crossTraining = TRAINING_CATEGORIES.has(candidate.category) && TRAINING_CATEGORIES.has(target.category)
    if (!sameCategory && !crossTraining) continue

    const pattern = movementPattern(candidate)
    const patternScore = targetPattern && pattern === targetPattern ? 4 : pattern && related.includes(pattern) ? 1 : 0
    const sameMuscle = target.muscle_group_id != null && candidate.muscle_group_id === target.muscle_group_id

    const acceptable = targetPattern ? patternScore > 0 : sameMuscle
    // Kuvvet ile kardiyo arasında geçiş yalnızca kalıp birebir tutuyorsa:
    // kettlebell swing yerine dambıl RDL olur, koşu bandı yerine şınav olmaz.
    if (!acceptable || (!sameCategory && patternScore < 4)) continue

    const score = patternScore
      + (sameMuscle ? 2 : 0)
      + (targetLoaded && candidate.equipment.length > 0 ? 0.5 : 0)
      - (sameCategory ? 0 : 1)
      + nameSimilarity(target, candidate)

    // Eşitlikte ada göre: aynı katalog her seferinde aynı sonucu versin.
    if (!best || score > best.score || (score === best.score && candidate.name.localeCompare(best.exercise.name, 'tr') < 0)) {
      best = { exercise: candidate, score }
    }
  }

  return best?.exercise ?? null
}

// -------------------------------------------------------
// Program uyarlama
// -------------------------------------------------------

export type AdaptStep =
  | { kind: 'keep'; row: ProgramExercise }
  | { kind: 'replace'; row: ProgramExercise; substitute: Exercise }
  | { kind: 'drop'; row: ProgramExercise; missing: EquipmentKey[] }

export interface ProgramAdaptation {
  days: Array<{ day: ProgramDay; steps: AdaptStep[] }>
  replaced: number
  dropped: number
}

/**
 * Programın her satırı için karar verir. Önce yapılabilen satırlar sabitlenir,
 * sonra değişecekler sırayla ikame alır; aynı gün içinde bir hareket iki kez
 * çıkmaz (Bench Press ve Chest Press Machine ikisi de şınava dönmesin).
 */
export function planProgramAdaptation(
  program: WorkoutProgram,
  catalog: readonly Exercise[],
  owned: OwnedEquipment,
): ProgramAdaptation {
  let replaced = 0
  let dropped = 0

  const days = [...(program.days ?? [])]
    .sort((a, b) => a.day_number - b.day_number)
    .map((day) => {
      const rows = [...(day.exercises ?? [])].sort((a, b) => a.order_index - b.order_index)
      const ids = new Set<string>()
      const movements = new Set<string>()
      for (const row of rows) {
        if (row.exercise && !isExerciseAvailable(row.exercise, owned)) continue
        ids.add(row.exercise_id)
        if (row.exercise) movements.add(movementKey(row.exercise))
      }

      const steps = rows.map((row): AdaptStep => {
        const exercise = row.exercise
        if (!exercise || isExerciseAvailable(exercise, owned)) return { kind: 'keep', row }

        const substitute = findSubstitute(exercise, catalog, owned, { ids, movements })
        if (!substitute) {
          dropped += 1
          return { kind: 'drop', row, missing: missingEquipment(exercise, owned) }
        }
        ids.add(substitute.id)
        movements.add(movementKey(substitute))
        replaced += 1
        return { kind: 'replace', row, substitute }
      })

      return { day, steps }
    })

  return { days, replaced, dropped }
}

export const ADAPTED_PROGRAM_SUFFIX = ' (ekipmanıma göre)'

/** Değişen satırın notu: kullanıcı programda neyin yerine ne yaptığını görsün. */
export function replacementNote(row: ProgramExercise): string {
  return [`${row.exercise?.name ?? 'Orijinal hareket'} yerine`, row.notes].filter(Boolean).join('. ')
}

/**
 * Hazır şablonun uyarlanmış kopyası için kayıt planı. Şablonlar herkesin
 * ortak satırları, yerinde değiştirilemez; kullanıcıya kendi kopyası açılır.
 * Tüm hareketleri düşen gün kopyaya alınmaz.
 */
export function adaptationToPlan(program: WorkoutProgram, adaptation: ProgramAdaptation): AiProgramPlan {
  const days = adaptation.days
    .map(({ day, steps }) => ({
      day_name: day.day_name,
      exercises: steps.flatMap((step) => {
        if (step.kind === 'drop') return []
        const { row } = step
        const note = step.kind === 'replace' ? replacementNote(row) : row.notes
        return [{
          exercise_id: step.kind === 'replace' ? step.substitute.id : row.exercise_id,
          sets: row.sets,
          reps: row.reps,
          rest_seconds: row.rest_seconds,
          notes: note,
        }]
      }),
    }))
    // Dinlenme günleri plan biçiminde yok (createProgramFromPlan gün sayısını
    // haftalık sıklık sayıyor). Şablonda zaten boş olan antrenman günü ise
    // bilinçli ("Karın & Kardiyo"), kopyada kalır.
    .filter((planDay, index) => {
      const source = adaptation.days[index]
      if (planDay.exercises.length > 0) return true
      return !!source && !source.day.is_rest && (source.day.exercises ?? []).length === 0
    })

  const baseName = program.name.endsWith(ADAPTED_PROGRAM_SUFFIX)
    ? program.name.slice(0, -ADAPTED_PROGRAM_SUFFIX.length)
    : program.name

  return {
    name: `${baseName}${ADAPTED_PROGRAM_SUFFIX}`,
    description: program.description ?? undefined,
    split_type: program.split_type,
    days,
  }
}
