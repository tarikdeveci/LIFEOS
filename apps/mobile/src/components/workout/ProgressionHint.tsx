import { useEffect, useState } from 'react'
import { View, Text, ActivityIndicator } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { best1RM, nextTarget } from '@lifeos/shared'
import type { Exercise, ProgressionTarget } from '@lifeos/shared'
import { getExerciseSessions } from '@lifeos/shared/supabase'
import { Button } from '../ui/Button'
import { useTheme } from '../../contexts/ThemeContext'
import { useLang } from '../../contexts/LangContext'
import { supabase } from '../../lib/supabase'
import { palette, fontSize, fontWeight, spacing, radius } from '../../theme/tokens'

interface Props {
  exercise: Exercise
  userId: string
  /** Bugün süren antrenman: öneri kendi setleriyle kıyaslanmasın. */
  excludeWorkoutId?: string
  onApply: (reps: number, weightKg: number | null) => void
}

type HintState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; target: ProgressionTarget | null; best: number | null }

function formatKg(value: number, lang: 'tr' | 'en'): string {
  const text = String(Math.round(value * 10) / 10)
  return lang === 'en' ? text : text.replace('.', ',')
}

/**
 * Set ekleme ekranında geçmiş seanslara göre bir sonraki hedef (utils/progression.ts).
 * Öneri yalnızca yol gösterir: "Uygula" alanları doldurur, kullanıcı yine değiştirebilir.
 */
export function ProgressionHint({ exercise, userId, excludeWorkoutId, onApply }: Props) {
  const { colors } = useTheme()
  const { t, lang } = useLang()
  const [state, setState] = useState<HintState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    void (async () => {
      try {
        const sessions = await getExerciseSessions(supabase, userId, exercise.id, 8, excludeWorkoutId)
        if (cancelled) return
        setState({ status: 'ready', target: nextTarget(exercise, sessions, null, lang), best: best1RM(sessions)?.value ?? null })
      } catch {
        if (!cancelled) setState({ status: 'error' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [exercise, userId, excludeWorkoutId, lang])

  if (state.status === 'loading') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        <ActivityIndicator size="small" color={colors.textMuted} />
        <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{t.wk_reading_history}</Text>
      </View>
    )
  }

  if (state.status === 'error') {
    return <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{t.wk_hint_error}</Text>
  }

  const { target, best } = state
  if (!target) {
    return <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{t.wk_no_history_hint}</Text>
  }

  const load = target.weightKg !== null ? ` · ${formatKg(target.weightKg, lang)} kg` : ''
  return (
    <View style={{ gap: spacing[2], padding: spacing[3], borderRadius: radius.lg, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        <Ionicons name="trending-up-outline" size={16} color={palette.success} />
        <Text style={{ flex: 1, fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
          {t.wk_suggestion.replace('{s}', `${target.sets} x ${target.reps}${load}`)}
        </Text>
        <Button label={t.wk_apply} size="sm" variant="secondary" onPress={() => onApply(target.reps, target.weightKg)} />
      </View>
      <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{target.reason}</Text>
      {best !== null && (
        <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>{t.wk_best_1rm.replace('{kg}', formatKg(best, lang))}</Text>
      )}
    </View>
  )
}
