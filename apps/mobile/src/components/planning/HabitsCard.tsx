import { useState } from 'react'
import { View, Text, TouchableOpacity, Alert, ScrollView } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import type { CreateRoutineInput, Routine } from '@lifeos/shared'
import { habitDoneDays, habitWeekProgress, isRoutineActiveOn, todayDate, useRoutineStore } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { RoutineSheet } from '@/src/components/planning/RoutineSheet'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

interface Props { userId: string }

/**
 * Bugünün alışkanlıkları. "Günde N kez" çipi her dokunuşta sayacı bir artırır ve bugünün
 * sayısını gösterir; "haftada N gün" çipi bugünü işaretler ve haftanın sayısını gösterir.
 * Uzun basınca geri alma ve düzenleme. Alışkanlık yokken ekleme daveti görünür.
 */
export function HabitsCard({ userId }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  const { routines, completions, progress, refreshProgress, setHabitCount, addRoutine, updateSeries, removeRoutine } = useRoutineStore()
  const [editing, setEditing] = useState<Routine | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const today = todayDate()
  const habits = routines.filter((r) => r.kind === 'habit' && isRoutineActiveOn(r, today))

  const write = async (routineId: string, count: number) => {
    try {
      await setHabitCount(supabase, userId, routineId, today, count)
      if (habits.some((h) => h.id === routineId && h.target_count)) void refreshProgress(supabase)
    } catch { Alert.alert(t.routines_error) }
  }

  const openSheet = (routine: Routine | null) => { setEditing(routine); setSheetOpen(true) }

  const handleSave = async (input: CreateRoutineInput) => {
    if (editing) await updateSeries(supabase, editing.id, input)
    else await addRoutine(supabase, userId, input)
  }

  const showActions = (h: Routine, count: number) => {
    Alert.alert(h.title, undefined, [
      ...(count > 0 ? [{ text: t.habits_undo, onPress: () => void write(h.id, count - 1) }] : []),
      { text: t.habits_edit, onPress: () => openSheet(h) },
      { text: t.cancel, style: 'cancel' as const },
    ])
  }

  return (
    <View style={{ marginBottom: spacing[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing[2], marginHorizontal: spacing[1] }}>
        <Text style={{ flex: 1, fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.textSubtle, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          {t.habits_short}
        </Text>
        {habits.length > 0 && (
          <TouchableOpacity onPress={() => openSheet(null)} hitSlop={10} accessibilityLabel={t.habits_add}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Ionicons name="add" size={16} color={palette.accent} />
            <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: palette.accent }}>{t.add}</Text>
          </TouchableOpacity>
        )}
      </View>

      {habits.length === 0 ? (
        <TouchableOpacity onPress={() => openSheet(null)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: `${palette.accent}18` }}>
            <Ionicons name="add" size={18} color={palette.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{t.habits_add}</Text>
            <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 }} numberOfLines={1}>{t.habits_empty_hint}</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing[2] }}>
          {habits.map((h) => {
            const own = completions.filter((c) => c.routine_id === h.id)
            const count = own.find((c) => c.completed_on === today)?.count ?? 0
            const perDay = h.times_per_day
            const doneToday = count >= (perDay ?? 1)
            const week = habitWeekProgress(habitDoneDays(own, perDay), h.times_per_week ?? 1, today)
            // Günde N kez: dolana kadar her dokunuş +1. Tek işaretlide dokunuş aç/kapa. Sayaç
            // dokunuş anında store'dan okunur: hızlı ikinci dokunuş eski render'ın değerini yazmasın.
            const tap = () => {
              const current = useRoutineStore.getState().completions
                .find((c) => c.routine_id === h.id && c.completed_on === today)?.count ?? 0
              void write(h.id, perDay ? current + 1 : current >= 1 ? 0 : 1)
            }
            const counter = perDay ? `${count}/${perDay}` : `${week.done}/${week.target} ${t.habits_week}`
            return (
              <TouchableOpacity key={h.id} onPress={tap} onLongPress={() => showActions(h, count)} delayLongPress={400}
                accessibilityRole="button" accessibilityState={{ checked: doneToday }}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingVertical: spacing[2], paddingLeft: spacing[2], paddingRight: spacing[3],
                  borderRadius: radius.full, borderWidth: 1,
                  backgroundColor: doneToday ? `${palette.success}1A` : colors.glassSolid,
                  borderColor: doneToday ? `${palette.success}55` : colors.border,
                }}>
                {perDay && !doneToday ? (
                  <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: count > 0 ? `${palette.accent}22` : 'transparent', borderWidth: 1.5, borderColor: count > 0 ? palette.accent : colors.textSubtle }}>
                    <Ionicons name="add" size={14} color={count > 0 ? palette.accent : colors.textSubtle} />
                  </View>
                ) : (
                  <Ionicons name={doneToday ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={doneToday ? palette.success : colors.textSubtle} />
                )}
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary, maxWidth: 160 }} numberOfLines={1}>{h.title}</Text>
                {!h.is_untracked && (
                  <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: doneToday || week.met ? palette.success : colors.textSubtle, fontVariant: ['tabular-nums'] }}>
                    {counter}
                  </Text>
                )}
                {!h.is_untracked && h.target_count != null && progress[h.id] !== undefined && (
                  <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, fontVariant: ['tabular-nums'] }}>
                    {`${Math.min(progress[h.id] ?? 0, h.target_count)}/${h.target_count}`}
                  </Text>
                )}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      )}

      <RoutineSheet userId={userId} visible={sheetOpen} routine={editing} defaultKind="habit"
        onClose={() => setSheetOpen(false)}
        onSave={handleSave}
        onDelete={editing ? () => removeRoutine(supabase, editing.id) : undefined} />
    </View>
  )
}
