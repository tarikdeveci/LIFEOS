import { View, Text, TouchableOpacity, Alert, ScrollView } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { habitWeekProgress, todayDate, useRoutineStore } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

interface Props { userId: string }

/**
 * "Haftada N kez" alışkanlıkları: tek dokunuşla bugünü işaretleyen çipler, yanında haftanın sayacı.
 * Kaçırılan gün cezalandırılmaz, sadece hafta sayılır.
 */
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
    <View style={{ marginBottom: spacing[4] }}>
      <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.textSubtle, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: spacing[2], marginLeft: spacing[1] }}>
        {t.habits_short}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing[2] }}>
        {habits.map((h) => {
          const days = completions.filter((c) => c.routine_id === h.id).map((c) => c.completed_on)
          const doneToday = days.includes(today)
          const progress = habitWeekProgress(days, h.times_per_week ?? 1, today)
          return (
            <TouchableOpacity key={h.id} onPress={() => void toggle(h.id, !doneToday)}
              accessibilityRole="checkbox" accessibilityState={{ checked: doneToday }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingVertical: spacing[2], paddingLeft: spacing[2], paddingRight: spacing[3],
                borderRadius: radius.full, borderWidth: 1,
                backgroundColor: doneToday ? `${palette.success}1A` : colors.glassSolid,
                borderColor: doneToday ? `${palette.success}55` : colors.border,
              }}>
              <Ionicons name={doneToday ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={doneToday ? palette.success : colors.textSubtle} />
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary, maxWidth: 160 }} numberOfLines={1}>{h.title}</Text>
              <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: progress.met ? palette.success : colors.textSubtle, fontVariant: ['tabular-nums'] }}>
                {progress.done}/{progress.target}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>
    </View>
  )
}
