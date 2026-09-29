import { View, Text, TouchableOpacity, Alert } from 'react-native'
import { habitWeekProgress, todayDate, useRoutineStore } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { TaskCheckbox } from '@/src/components/ui/TaskCheckbox'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing } from '@/src/theme/tokens'

interface Props { userId: string }

/** "Haftada N kez" alışkanlıkları: bugünü işaretle. Kaçırılan gün cezalandırılmaz, sadece hafta sayılır. */
export function HabitsCard({ userId }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  const { routines, completions, toggleHabit } = useRoutineStore()
  const today = todayDate()
  const habits = routines.filter((r) => r.kind === 'habit' && r.is_active)
  if (habits.length === 0) return null

  const toggle = async (routineId: string, done: boolean) => {
    try { await toggleHabit(supabase, userId, routineId, today, done) }
    catch { Alert.alert(t.routines_error) }
  }

  return (
    <GlassCard style={{ marginBottom: spacing[4] }}>
      <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing[3] }}>{t.habits_title}</Text>
      <View style={{ gap: spacing[2] }}>
        {habits.map((h) => {
          const days = completions.filter((c) => c.routine_id === h.id).map((c) => c.completed_on)
          const doneToday = days.includes(today)
          const progress = habitWeekProgress(days, h.times_per_week ?? 1, today)
          return (
            <TouchableOpacity key={h.id} onPress={() => void toggle(h.id, !doneToday)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
              <TaskCheckbox done={doneToday} onToggle={() => void toggle(h.id, !doneToday)} />
              <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.textPrimary }} numberOfLines={1}>{h.title}</Text>
              <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: progress.met ? palette.success : colors.textSubtle }}>
                {t.habits_progress.replace('{done}', String(progress.done)).replace('{target}', String(progress.target))}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </GlassCard>
  )
}
