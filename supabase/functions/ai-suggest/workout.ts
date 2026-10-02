// supabase/functions/ai-suggest/workout.ts
// Antrenman rotaları: workout_plan (bugünün önerileri) ve workout_program_chat (program koçu sohbeti).

import {
  buildWorkoutCoachPrompt,
  parseWorkoutCoachResult,
  type WorkoutCatalogEntry,
} from '../_shared/ai/coach.ts'
import { isDoableWith, parseEquipmentPreference } from '../_shared/ai/equipment.ts'
import {
  flattenWorkoutRows,
  muscleLoadLine,
  summarizeMuscleLoad,
  type MuscleGroupRef,
} from '../_shared/ai/muscleLoad.ts'
import { CHAT_EFFORT, firstText } from './model.ts'
import { normalizeHistory, type RouteContext } from './request.ts'
import { shiftDate } from './time.ts'

function normalizeExerciseName(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function relationRecord(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value
  return candidate !== null && typeof candidate === 'object'
    ? candidate as Record<string, unknown>
    : null
}

function relationRecords(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
}

function muscleNamesFromSets(value: unknown): string[] {
  return relationRecords(value).flatMap((set) => {
    const exercise = relationRecord(set['exercise'])
    const muscleGroup = relationRecord(exercise?.['muscle_group'])
    const name = muscleGroup?.['name']
    return typeof name === 'string' ? [name] : []
  })
}

export async function handleWorkoutPlan(route: RouteContext): Promise<Response> {
  const { supabase, userId, client, chatModel, ledger, langInstr, today, json } = route
  const { fitness_goal, available_minutes, energy_level } = route.body

  // Bugün için antrenman planı önerileri
  const { data: recentWorkoutData } = await supabase
    .from('workouts')
    .select('date, name, status, workout_sets(exercise:exercises(name, muscle_group:muscle_groups(name)))')
    .eq('user_id', userId)
    .gte('date', shiftDate(today, -7))
    .order('date', { ascending: false })
    .limit(7)

  const recentSummary = recentWorkoutData
    ?.filter((w) => w.status === 'completed')
    .map((w) => {
      const muscles = [...new Set(muscleNamesFromSets(w.workout_sets))]
      return `${w.date}: ${w.name ?? 'Antrenman'} (${muscles.join(', ') || 'bilinmiyor'})`
    })
    .join('\n') ?? 'Geçmiş antrenman yok'

  const response = await client.messages.create({
    model: chatModel,
    output_config: CHAT_EFFORT,
    // Dusunme (effort low) ayni butceyi paylasiyor: eski deger dusunme
    // yokken olculmustu, simdi ciktinin yarim kalmamasi icin pay birakiyoruz.
    max_tokens: 4500,
    system: `Sen LifeOS'un kişisel fitness koçusun. ${langInstr}
Kullanıcının antrenman geçmişine göre bugün ne yapması gerektiğini öneri olarak sun.
Yanıtını şu JSON dizisi formatında ver — her öneri bir nesne:
[{"type": "exercise_suggestion"|"rest"|"progression"|"general", "message": "öneri metni", "exercise_id": null}]
Öneride şunlara dikkat et:
1. Kas gruplarını dengeli çalıştır (arka arkaya aynı kas grubu olmasın)
2. Dinlenme günü gerekiyorsa rest öner
3. İlerleme (progression): ağırlık / tekrar artışı öner
4. Mevcut enerji seviyesine göre yoğunluk ayarla`,
    messages: [{
      role: 'user',
      content: `Bugün için antrenman önerileri ver.

Hedef: ${fitness_goal ?? 'genel fitness'}
Süre: ${available_minutes ?? 60} dakika
Enerji seviyesi: ${energy_level ?? 3}/5

Son 7 günün antrenmanları:
${recentSummary}

Lütfen:
1. Bugün hangi kas grubunu çalışmalı?
2. Hangi egzersizleri yapmalı? (3-5 egzersiz)
3. Kaç set/tekrar?
4. Gerekiyorsa dinlenme günü öner`,
    }],
  })
  await ledger.record(response)

  const text = firstText(response)
  let suggestions: unknown[] = []
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (jsonMatch) suggestions = JSON.parse(jsonMatch[0])
  } catch {
    suggestions = [{ type: 'general', message: text }]
  }

  return json({ suggestions })
}

export async function handleWorkoutProgramChat(route: RouteContext): Promise<Response> {
  const { supabase, userId, body, client, chatModel, ledger, lang, today, json } = route
  const { user_message, workout_context } = body

  // Katalog sunucudan okunur: istemciye güvenip 200 satır göndertmek hem
  // isteği şişiriyor hem de eski sürümlerde eksik alan bırakıyordu.
  const [{ data: catalogRows }, { data: profileRow }] = await Promise.all([
    supabase
      .from('exercises')
      .select('name, category, is_bodyweight, equipment, muscle_group:muscle_groups(name)')
      .order('name', { ascending: true }),
    supabase.from('user_profiles').select('preferences').eq('id', userId).maybeSingle(),
  ])
  const ownedEquipment = parseEquipmentPreference(
    (profileRow?.preferences as Record<string, unknown> | null)?.['workout_equipment'],
  )

  const catalog: WorkoutCatalogEntry[] = catalogRows?.length
    ? catalogRows.map((row) => ({
        name: row.name as string,
        category: (row.category as string | null) ?? undefined,
        muscle_group: (() => {
          const value = relationRecord(row.muscle_group)?.['name']
          return typeof value === 'string' ? value : undefined
        })(),
        is_bodyweight: (row.is_bodyweight as boolean | null) ?? false,
        equipment: (row.equipment as string[] | null) ?? null,
      }))
    : (workout_context?.available_exercises ?? [])

  if (catalog.length === 0) {
    return json({
      message: 'Egzersiz kütüphanesi henüz hazır değil. Kütüphane yüklenince tekrar dene.',
      program: null,
    })
  }

  // Çözümleme yalnızca yapılabilir hareketlere: model kurala uymayıp barbell
  // yazsa bile dambıllı kullanıcının programına barbell satırı girmez.
  // Kısmi eşleşme de aynı kümede aranır.
  const doable = catalog.filter((e) => isDoableWith(e.equipment, ownedEquipment))
  const catalogByNormalized = new Map(doable.map((e) => [normalizeExerciseName(e.name), e.name]))
  const resolveName = (requested: string): string | null => {
    const key = normalizeExerciseName(requested)
    const exact = catalogByNormalized.get(key)
    if (exact) return exact
    // Model "Barbell Squat" derken katalogda "Squat" olabilir; tek yönlü
    // kapsama yeterince güvenli çünkü kısa isim uzunun içinde geçiyor.
    for (const [candidate, original] of catalogByNormalized) {
      if (candidate.includes(key) || key.includes(candidate)) return original
    }
    return null
  }

  const { data: recentRows } = await supabase
    .from('workouts')
    .select('date, name, status, workout_sets(exercise:exercises(muscle_group:muscle_groups(name)))')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('date', shiftDate(today, -14))
    .order('date', { ascending: false })
    .limit(10)

  const recentWorkouts = (recentRows ?? []).map((w) => ({
    date: w.date as string,
    name: (w.name as string | null) ?? 'Antrenman',
    muscle_groups: [...new Set(muscleNamesFromSets(w.workout_sets))],
  }))

  const [{ data: programRows }, { data: loadRows }, { data: groupRows }] = await Promise.all([
    supabase.from('workout_programs').select('name').eq('user_id', userId).limit(10),
    // Kas yükü: bugün süren antrenman dahil son 7 gün, tamamlanan setler.
    supabase
      .from('workouts')
      .select('date, workout_sets(completed, exercise:exercises(category, muscle_group_id, secondary_muscle_group_ids))')
      .eq('user_id', userId)
      .gte('date', shiftDate(today, -6))
      .lte('date', today),
    supabase.from('muscle_groups').select('id, name, name_en'),
  ])
  const muscleLoad = muscleLoadLine(
    summarizeMuscleLoad((groupRows ?? []) as MuscleGroupRef[], flattenWorkoutRows(loadRows), today),
  )

  const { system, messages } = buildWorkoutCoachPrompt({
    lang,
    catalog,
    equipment: ownedEquipment,
    recentWorkouts,
    muscleLoad,
    existingProgramNames: (programRows ?? []).map((p) => p.name as string),
    history: normalizeHistory(workout_context?.history ?? body.history),
    userMessage: user_message?.trim() || 'Bana haftalık bir antrenman programı yaz.',
  })

  const response = await client.messages.create({
    model: chatModel,
    output_config: CHAT_EFFORT,
    // Dusunme (effort low) ayni butceyi paylasiyor: eski deger dusunme
    // yokken olculmustu, simdi ciktinin yarim kalmamasi icin pay birakiyoruz.
    max_tokens: 9000,
    system,
    messages,
  })
  await ledger.record(response)

  const result = parseWorkoutCoachResult(firstText(response), resolveName)
  if (!result.message) {
    result.message = 'Yanıt oluşturulamadı, isteğini biraz daha netleştirip tekrar dene.'
  }
  return json(result)
}
