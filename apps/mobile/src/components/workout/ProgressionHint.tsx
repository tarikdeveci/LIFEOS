import { useEffect, useState } from 'react'
import { View, Text, ActivityIndicator } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { best1RM, nextTarget } from '@lifeos/shared'
import type { Exercise, ProgressionTarget } from '@lifeos/shared'
import { getExerciseSessions } from '@lifeos/shared/supabase'
import { Button } from '../ui/Button'
import { useTheme } from '../../contexts/ThemeContext'
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

function formatKg(value: number): string {
  return String(Math.round(value * 10) / 10).replace('.', ',')
}

/**
 * Set ekleme ekranında geçmiş seanslara göre bir sonraki hedef (utils/progression.ts).
 * Öneri yalnızca yol gösterir: "Uygula" alanları doldurur, kullanıcı yine değiştirebilir.
 */
export function ProgressionHint({ exercise, userId, excludeWorkoutId, onApply }: Props) {
  const { colors } = useTheme()
  const [state, setState] = useState<HintState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    void (async () => {
      try {
        const sessions = await getExerciseSessions(supabase, userId, exercise.id, 8, excludeWorkoutId)
        if (cancelled) return
        setState({ status: 'ready', target: nextTarget(exercise, sessions), best: best1RM(sessions)?.value ?? null })
      } catch {
        if (!cancelled) setState({ status: 'error' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [exercise, userId, excludeWorkoutId])

  if (state.status === 'loading') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        <ActivityIndicator size="small" color={colors.textMuted} />
        <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>Geçmiş seanslar okunuyor...</Text>
      </View>
    )
  }

  if (state.status === 'error') {
    return <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>Öneri şu an alınamadı.</Text>
  }

  const { target, best } = state
  if (!target) {
    return <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>Bu hareketin geçmişi yok, rahat bir ağırlıkla başla.</Text>
  }

  const load = target.weightKg !== null ? ` · ${formatKg(target.weightKg)} kg` : ''
  return (
    <View style={{ gap: spacing[2], padding: spacing[3], borderRadius: radius.lg, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        <Ionicons name="trending-up-outline" size={16} color={palette.success} />
        <Text style={{ flex: 1, fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
          Öneri: {target.sets} x {target.reps}{load}
        </Text>
        <Button label="Uygula" size="sm" variant="secondary" onPress={() => onApply(target.reps, target.weightKg)} />
      </View>
      <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{target.reason}</Text>
      {best !== null && (
        <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>Tahmini en iyi 1RM: {formatKg(best)} kg</Text>
      )}
    </View>
  )
}
