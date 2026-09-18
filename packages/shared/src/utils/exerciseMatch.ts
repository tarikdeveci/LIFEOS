/**
 * İçe aktarılan egzersiz adını katalogla eşleme (CSV içe aktarma).
 *
 * Sıra: tam ad, sonra kelime kümesi ("Bench Press (Barbell)" ile "Barbell Bench
 * Press" aynı hareket), sonra en yakın kısmi eşleşme. Kısmi eşleşme ilk bulunanı
 * değil en benzerini seçer ve alet kelimesi uyuşmayan adayı reddeder: "Bench
 * Press (Dumbbell)" halter Bench Press'e bağlanmaz, eşleşme bulunamazsa
 * kullanıcının kendi egzersizi olarak oluşturulur. Yanlış varyanta bağlanan set,
 * o hareketin 1RM ve ilerleme geçmişini bozardı.
 */

/** Türkçe aksan/noktalama farklarını eleyerek karşılaştırılabilir hale getirir. */
export function foldExerciseName(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Hareketin varyantını belirleyen alet kelimeleri (katlanmış ve tekil hali). */
const EQUIPMENT_TOKENS = new Set([
  'barbell', 'dumbbell', 'cable', 'machine', 'kettlebell', 'smith', 'band', 'ez', 'landmine',
  'weighted', 'assisted', 'halter', 'dambil', 'kablo', 'makine', 'bant',
])

/** Basit tekilleştirme: "Squats"/"Squat", "Biceps"/"Bicep" aynı kelime sayılsın. */
function stem(token: string): string {
  return token.length > 3 && token.endsWith('s') && !token.endsWith('ss') ? token.slice(0, -1) : token
}

function tokensOf(value: string): Set<string> {
  return new Set(foldExerciseName(value).split(' ').filter(Boolean).map(stem))
}

function equipmentOf(tokens: ReadonlySet<string>): string {
  return [...tokens].filter((t) => EQUIPMENT_TOKENS.has(t)).sort().join('|')
}

function isSubset(small: ReadonlySet<string>, large: ReadonlySet<string>): boolean {
  for (const t of small) if (!large.has(t)) return false
  return true
}

interface Score {
  /** Fazla kelimelerden alet olmayanların sayısı; az olan daha yakın. */
  extra: number
  /** Ortak kelime oranı; yüksek olan daha yakın. */
  ratio: number
  length: number
}

function better(a: Score, b: Score | null): boolean {
  if (!b) return true
  if (a.extra !== b.extra) return a.extra < b.extra
  if (a.ratio !== b.ratio) return a.ratio > b.ratio
  return a.length < b.length
}

export interface ExerciseMatch<T> {
  exercise: T
  /** Ad birebir aynı değil, kelime/kısmi eşleşmeyle bulundu: önizlemede gösterilmeli. */
  approximate: boolean
}

export function findExerciseMatch<T extends { name: string; name_en: string | null }>(
  importedName: string,
  candidates: readonly T[],
): ExerciseMatch<T> | null {
  const folded = foldExerciseName(importedName)
  if (!folded) return null

  for (const candidate of candidates) {
    if (foldExerciseName(candidate.name) === folded) return { exercise: candidate, approximate: false }
    if (candidate.name_en && foldExerciseName(candidate.name_en) === folded) return { exercise: candidate, approximate: false }
  }

  const wanted = tokensOf(importedName)
  const wantedEquipment = equipmentOf(wanted)
  let best: T | null = null
  let bestScore: Score | null = null

  for (const candidate of candidates) {
    const labels = candidate.name_en ? [candidate.name_en, candidate.name] : [candidate.name]
    for (const label of labels) {
      const tokens = tokensOf(label)
      if (tokens.size === 0) continue
      if (tokens.size === wanted.size && isSubset(tokens, wanted)) return { exercise: candidate, approximate: true }
      // İçe aktarılan ad bir alet söylüyorsa aday da aynı aleti söylemeli.
      if (wantedEquipment && equipmentOf(tokens) !== wantedEquipment) continue

      const [small, large] = tokens.size <= wanted.size ? [tokens, wanted] : [wanted, tokens]
      if (!isSubset(small, large)) continue
      const only = small.size === 1 ? [...small][0] : undefined
      if (only !== undefined && only.length <= 3) continue

      let extra = 0
      for (const t of large) if (!small.has(t) && !EQUIPMENT_TOKENS.has(t)) extra += 1
      const score: Score = { extra, ratio: small.size / large.size, length: label.length }
      if (better(score, bestScore)) {
        best = candidate
        bestScore = score
      }
    }
  }

  return best ? { exercise: best, approximate: true } : null
}

/** findExerciseMatch'in yalnızca egzersizi döndüren kısa hali; eşleşme yoksa null. */
export function matchExerciseName<T extends { name: string; name_en: string | null }>(
  importedName: string,
  candidates: readonly T[],
): T | null {
  return findExerciseMatch(importedName, candidates)?.exercise ?? null
}
