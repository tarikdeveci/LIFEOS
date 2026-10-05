// supabase/functions/_shared/ai/workoutCoach.ts
//
// Antrenman koçu: prompt kurulumu ve program yanıtının ayrıştırılması. Ortak
// yardımcılar ve tipler coach.ts'te; sözleşme aynı (tek JSON nesnesi, `message`
// kullanıcıya gösterilecek metin).

import {
  type AnthropicMessage,
  type ChatTurn,
  type Lang,
  type SystemBlock,
  asInt,
  asString,
  extractJsonObject,
  historyToMessages,
  langLine,
  sanitizeMessages,
  systemBlocks,
} from './coach.ts'
import { equipmentSummary, equipmentTag } from './equipment.ts'

export interface WorkoutCatalogEntry {
  name: string
  category?: string
  muscle_group?: string
  is_bodyweight?: boolean
  /** Gereken aletler. undefined = eski istemci listesi, null = bilinmiyor. */
  equipment?: string[] | null
}

export interface WorkoutCoachInput {
  lang: Lang
  catalog: WorkoutCatalogEntry[]
  /** Kullanıcının erişebildiği aletler; null = seçim yapmamış. */
  equipment: string[] | null
  /** Son antrenmanlar: "dün bacak yaptım" bilgisini modele vermek için. */
  recentWorkouts: { date: string; name: string; muscle_groups: string[] }[]
  /** Son 7 günün kas yükü satırı (muscleLoad.ts muscleLoadLine); eski çağıranlar vermeyebilir. */
  muscleLoad?: string
  existingProgramNames: string[]
  history: ChatTurn[]
  userMessage: string
}

export function buildWorkoutCoachPrompt(input: WorkoutCoachInput): {
  system: SystemBlock[]
  messages: AnthropicMessage[]
} {
  // Katalog uzun; modele bölgeye göre gruplanmış veriyoruz ki gün kurgularken
  // "bu güne hangi hareketler uyar" sorusunu tarayarak değil bakarak çözsün.
  //
  // Katalog GLOBAL: exercises tablosundan `order('name')` ile okunuyor, yani
  // her kullanıcı için aynı ve sıralaması deterministik. Prompt'un sabit
  // yarısında durmasının sebebi bu: 239 satır, ölçülen ~3.6k token, ve bu
  // veri iki tur arasında hiç değişmiyor. Eskiden kullanıcının antrenman
  // geçmişinden SONRA geldiği için tamamı her turda yeniden faturalanıyordu.
  const byGroup = new Map<string, string[]>()
  for (const entry of input.catalog) {
    const key = entry.muscle_group ?? 'Diğer'
    const list = byGroup.get(key) ?? []
    list.push(
      entry.equipment !== undefined
        ? `${entry.name}${equipmentTag(entry.equipment)}`
        : entry.is_bodyweight ? `${entry.name} (vücut ağırlığı)` : entry.name,
    )
    byGroup.set(key, list)
  }
  const catalogSummary = [...byGroup.entries()]
    .map(([group, names]) => `${group}: ${names.join(', ')}`)
    .join('\n')

  const recentSummary = input.recentWorkouts.length > 0
    ? input.recentWorkouts
        .map((w) => `- ${w.date}: ${w.name} (${w.muscle_groups.join(', ') || 'kas grubu kayıtsız'})`)
        .join('\n')
    : '- (Son 14 günde tamamlanmış antrenman yok)'

  const programsSummary = input.existingProgramNames.length > 0
    ? input.existingProgramNames.map((n) => `- ${n}`).join('\n')
    : '- (Kayıtlı program yok)'

  // ── SABİT: kimlik + kurallar + yanıt biçimi + global egzersiz kataloğu ──
  const stable = `Sen LifeOS'un antrenman koçusun. ${langLine(input.lang)}

KİMLİĞİN
Salonda yanında duran bir antrenör gibi konuş. Kullanıcı soru soruyorsa cevap
ver; program istiyorsa haftalık program yaz. Her seferinde program üretmek
zorunda değilsin.

KULLANILABİLİR EGZERSİZ KATALOĞU (kas grubuna göre)
${catalogSummary}

PROGRAM YAZMA KURALLARI
1. Egzersiz adlarını YALNIZCA yukarıdaki katalogdan, birebir yazıldığı gibi seç.
   Katalogda olmayan bir hareketi programa koyma; en yakın alternatifi seç.
2. Haftada 2-6 gün. Her günde 4-8 hareket.
3. Bileşik hareketle başla, izolasyonla bitir.
4. Her kas grubunu haftada en az 2 kez çalıştır (bro split özellikle istenmedikçe).
5. rest_seconds: ağır bileşik 120-180, orta 90, izolasyon 45-60.
6. Gün adı ne çalışıldığını söylesin ("İtiş — Göğüs/Omuz/Triceps" gibi).
7. Kullanıcı hedefini söylemediyse sorup durma: makul bir varsayım yap,
   message içinde varsayımını tek cümleyle belirt ve programı yine de ver.
8. Sakatlık, ağrı veya tıbbi bir durumdan söz edilirse program yazmadan önce
   hekim/fizyoterapist önerisi olduğunu belirt.
9. Katalogda köşeli parantez hareketin gerektirdiği aletlerin hepsidir
   ([barbell+bench] ikisini birden ister, [alet yok] hiçbir şey istemez).
   Kullanıcının aletleri aşağıda yazıyorsa YALNIZCA onlarla yapılabilen
   hareketleri seç; etiketsiz hareketlerin aleti bilinmiyor, onlardan kaçın.
   Eksik alet yüzünden bir kas grubu zayıf kalıyorsa message içinde tek
   cümleyle söyle (örneğin barfiks barı olmadan sırt için seçenek az).
   Kayıtlı aletler dışındaki hareketler programa kaydedilemez. Kullanıcı
   mesajında farklı bir durum söylerse ("salona yazıldım") programı yine
   kayıtlı aletlerle yaz ve message içinde ekipman seçimini Antrenman
   ekranındaki Ekipmanım kartından güncelleyebileceğini söyle.
10. Kas yükü satırı son 7 günün etkili set sayısını verir (ana kas 1, yardımcı
   kas 0,4). İhmal edilen kaslara programda daha çok hacim ver; son 48 saatte
   yoğun çalışılan kası programın ilk gününe koyma.

YANIT BİÇİMİ — yalnızca geçerli JSON döndür, başka hiçbir metin ekleme:
{
  "message": "kullanıcıya gösterilecek metin",
  "program": {
    "name": "Program adı",
    "description": "Kimin için, neye göre kurulduğu — 1-2 cümle",
    "split_type": "full_body|upper_lower|push_pull_legs|bro_split|custom",
    "days": [
      {
        "day_name": "Gün adı",
        "exercises": [
          { "exercise_name": "Katalogdaki isim", "sets": 3, "reps": 10, "rest_seconds": 90, "notes": "opsiyonel kısa not" }
        ]
      }
    ]
  }
}
Program üretmiyorsan "program": null ver. message alanı her durumda dolu olmalı.`

  // ── DEĞİŞKEN: kullanıcının kendi durumu ──
  const volatile = `KULLANICININ DURUMU
${equipmentSummary(input.equipment)}

Son antrenmanlar:
${recentSummary}
${input.muscleLoad ? `
Kas yükü:
${input.muscleLoad}
` : ''}
Kayıtlı programları:
${programsSummary}`

  const messages = sanitizeMessages([
    ...historyToMessages(input.history),
    { role: 'user', content: input.userMessage },
  ])

  return { system: systemBlocks(stable, volatile), messages }
}

export interface WorkoutProgramExercise {
  exercise_name: string
  sets: number
  reps: number
  rest_seconds: number
  notes: string | null
  /** Eski istemciler için: yeni akışta kullanılmıyor. */
  weight_kg: number
}

export interface WorkoutProgramDay {
  day_name: string
  exercises: WorkoutProgramExercise[]
}

export interface WorkoutProgramPayload {
  name: string
  description: string
  split_type: string
  frequency_per_week: number
  days: WorkoutProgramDay[]
  /**
   * Günleri düzleştirilmiş hali. App Store'daki eski sürümler program.exercises
   * okuyor; alanı kaldırmak onları bozardı.
   */
  exercises: WorkoutProgramExercise[]
}

export interface WorkoutCoachResult {
  message: string
  program: WorkoutProgramPayload | null
}

const SPLIT_TYPES = new Set(['full_body', 'upper_lower', 'push_pull_legs', 'bro_split', 'custom'])

/**
 * Model çıktısını kataloğa karşı doğrular. Eşleşmeyen hareketler sessizce
 * düşürülür: uydurulmuş bir egzersiz adı istemcide çözülemeyeceği için
 * programa yazılırsa boş satır olarak görünür.
 */
export function parseWorkoutCoachResult(
  text: string,
  resolveName: (name: string) => string | null,
): WorkoutCoachResult {
  const parsed = extractJsonObject(text)
  if (!parsed) return { message: text.trim(), program: null }

  const message = asString(parsed['message'], text.trim())
  const rawProgram = parsed['program']
  if (!rawProgram || typeof rawProgram !== 'object') return { message, program: null }

  const programRecord = rawProgram as Record<string, unknown>
  const rawDays = Array.isArray(programRecord['days']) ? programRecord['days'] : []

  const days = rawDays.flatMap((rawDay, dayIndex): WorkoutProgramDay[] => {
    if (!rawDay || typeof rawDay !== 'object') return []
    const dayRecord = rawDay as Record<string, unknown>
    const rawExercises = Array.isArray(dayRecord['exercises']) ? dayRecord['exercises'] : []

    const exercises = rawExercises.flatMap((rawExercise): WorkoutProgramExercise[] => {
      if (!rawExercise || typeof rawExercise !== 'object') return []
      const exerciseRecord = rawExercise as Record<string, unknown>
      const requested = asString(exerciseRecord['exercise_name'])
      if (!requested) return []
      const matched = resolveName(requested)
      if (!matched) return []

      return [{
        exercise_name: matched,
        sets: asInt(exerciseRecord['sets'], 3, 1, 10),
        reps: asInt(exerciseRecord['reps'], 10, 1, 100),
        rest_seconds: asInt(exerciseRecord['rest_seconds'], 90, 15, 300),
        notes: asString(exerciseRecord['notes']) || null,
        weight_kg: 0,
      }]
    })

    if (exercises.length === 0) return []
    return [{
      day_name: asString(dayRecord['day_name'], `Gün ${dayIndex + 1}`),
      exercises,
    }]
  })

  if (days.length === 0) return { message, program: null }

  const splitType = asString(programRecord['split_type'], 'custom')

  return {
    message,
    program: {
      name: asString(programRecord['name'], 'AI Program'),
      description: asString(programRecord['description']),
      split_type: SPLIT_TYPES.has(splitType) ? splitType : 'custom',
      frequency_per_week: days.length,
      days,
      exercises: days.flatMap((day) => day.exercises),
    },
  }
}
