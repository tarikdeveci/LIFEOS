import { useState } from 'react'
import { Alert } from 'react-native'
import { useWorkoutStore } from '@lifeos/shared'
import type { AiProgramPlan, WorkoutProgram } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { aiErrorMessage, callAiSuggest } from '@/src/lib/ai'
import type { AiChatMessage } from '@/src/components/ai/AiChatSheet'
import { useLang } from '@/src/contexts/LangContext'

/** ai-suggest'in antrenman koçundan dönen program önerisi. */
interface CoachProgramExercise { exercise_name: string; sets: number; reps: number; rest_seconds: number; notes: string | null }
interface CoachProgramDay { day_name: string; exercises: CoachProgramExercise[] }
interface CoachProgram {
  name: string
  description: string
  split_type: WorkoutProgram['split_type']
  days: CoachProgramDay[]
}

/** Türkçe aksan ve noktalama farklarını eleyerek egzersiz adı eşler. */
function foldName(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

interface Options {
  userId: string | null
  /** Pro değilse uyarıyı gösterir ve false döner. */
  requirePro: () => boolean
  /** Koçun programı kaydedildi: ekran programı açar ve planlayıcıya geçer. */
  onProgramSaved: (program: WorkoutProgram) => void
}

/** AI koç sohbeti: mesajlar, gönderim ve koçun yazdığı programı kaydetme. */
export function useWorkoutCoach({ userId, requirePro, onProgramSaved }: Options) {
  const { t } = useLang()
  const { exercises, equipment, createProgramFromPlan } = useWorkoutStore()

  const [showCoach, setShowCoach] = useState(false)
  const [coachMsgs, setCoachMsgs] = useState<AiChatMessage[]>([])
  const [coachInput, setCoachInput] = useState('')
  const [coachLoading, setCoachLoading] = useState(false)

  /**
   * Koçun yazdığı programı kaydedilebilir plana çevirir. Edge function egzersiz
   * adlarını kataloğa karşı doğruladığı için burada eşleşmeme beklenmiyor; yine de
   * kütüphane bayatsa hareket düşer, program yarım kaydedilmez.
   */
  function toProgramPlan(program: CoachProgram): AiProgramPlan | null {
    const byName = new Map(exercises.map((e) => [foldName(e.name), e.id]))
    const days = program.days.flatMap((day) => {
      const items = day.exercises.flatMap((ex) => {
        const id = byName.get(foldName(ex.exercise_name))
        if (!id) return []
        return [{ exercise_id: id, sets: ex.sets, reps: ex.reps, rest_seconds: ex.rest_seconds, notes: ex.notes }]
      })
      return items.length > 0 ? [{ day_name: day.day_name, exercises: items }] : []
    })
    if (days.length === 0) return null
    return { name: program.name, description: program.description, split_type: program.split_type, days }
  }

  function describeProgram(program: CoachProgram): string {
    return program.days
      .map((day) => {
        const lines = day.exercises
          .map((ex) => `  • ${ex.exercise_name}: ${ex.sets}x${ex.reps} · ${ex.rest_seconds}${t.coach_rest_sec}`)
          .join('\n')
        return `${day.day_name}\n${lines}`
      })
      .join('\n\n')
  }

  async function sendCoach(text: string) {
    const trimmed = text.trim()
    if (!trimmed || !userId || coachLoading) return
    if (!requirePro()) return

    const history = coachMsgs.slice(-8).map((m) => ({ role: m.role, text: m.content }))
    setCoachMsgs((m) => [...m, { role: 'user', content: trimmed }])
    setCoachInput('')
    setCoachLoading(true)
    try {
      const data = await callAiSuggest<{ message?: string; program?: CoachProgram | null }>({
        type: 'workout_program_chat',
        user_message: trimmed,
        workout_context: { history },
      })

      const program = data.program ?? null
      const plan = program ? toProgramPlan(program) : null
      const content = program
        ? `${data.message ?? ''}\n\n${program.name}\n${describeProgram(program)}`.trim()
        : (data.message ?? t.coach_no_reply)

      setCoachMsgs((m) => [...m, {
        role: 'assistant',
        content,
        actions: plan
          ? [{
              label: t.coach_save_program.replace('{n}', String(plan.days.length)),
              icon: 'bookmark-outline' as const,
              doneLabel: t.coach_saved,
              onPress: async () => {
                try {
                  const saved = await createProgramFromPlan(supabase, userId, plan)
                  // Kaydın hemen ardından planlayıcı açılıyor, varsayılanlar dolu:
                  // kullanıcı günleri ve saati görüp tek dokunuşla takvime yazar.
                  const full = useWorkoutStore.getState().programs.find((p) => p.id === saved.id) ?? saved
                  setShowCoach(false)
                  onProgramSaved(full)
                } catch {
                  Alert.alert(t.error, t.coach_save_error)
                  throw new Error('save failed')
                }
              },
            }]
          : [],
      }])
    } catch (error) {
      setCoachMsgs((m) => [...m, { role: 'assistant', content: aiErrorMessage(error, t.coach_unreachable) }])
    } finally {
      setCoachLoading(false)
    }
  }

  const baseCoachSuggestions = [t.coach_suggestion_1, t.coach_suggestion_2, t.coach_suggestion_3, t.coach_suggestion_4]
  // Ekipman seçilmişse koç bunu zaten sunucu tarafında zorluyor; öneri yalnızca kullanıcıya bunu hatırlatır.
  const coachSuggestions = equipment === null ? baseCoachSuggestions : [t.coach_suggestion_equipment, ...baseCoachSuggestions]

  return { showCoach, setShowCoach, coachMsgs, coachInput, setCoachInput, coachLoading, sendCoach, coachSuggestions }
}
