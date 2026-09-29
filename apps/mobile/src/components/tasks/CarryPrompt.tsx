import { View, Text, TouchableOpacity, Alert } from 'react-native'
import type { Task } from '@lifeos/shared'
import { shouldAskStillImportant, todayDate, useTaskStore } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

interface Props { tasks: Task[] }

/**
 * Suçsuz devir: gece devri bir görevi CARRY_PROMPT_THRESHOLD kez taşıdıysa tek soru.
 * Uyarı rengi yok; devretmek normal, sadece listenin şişmesini engelliyoruz.
 */
export function CarryPrompt({ tasks }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  const { updateTask, deleteTask } = useTaskStore()
  const asking = tasks.filter((task) => task.status !== 'done' && shouldAskStillImportant(task))
  if (asking.length === 0) return null

  const run = async (p: Promise<unknown>) => {
    try { await p } catch { Alert.alert(t.routines_error) }
  }

  const action = (label: string, onPress: () => void, primary = false) => (
    <TouchableOpacity onPress={onPress}
      style={{ paddingHorizontal: spacing[3], paddingVertical: 6, borderRadius: radius.md, backgroundColor: primary ? `${palette.accent}18` : colors.glassInner }}>
      <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: primary ? palette.accent : colors.textMuted }}>{label}</Text>
    </TouchableOpacity>
  )

  return (
    <GlassCard>
      <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing[3] }}>{t.carry_title}</Text>
      <View style={{ gap: spacing[3] }}>
        {asking.slice(0, 3).map((task) => (
          <View key={task.id} style={{ gap: spacing[2] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
              <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.textPrimary }} numberOfLines={1}>{task.title}</Text>
              <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>{t.carry_moved.replace('{n}', String(task.carry_count))}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              {action(t.carry_keep, () => void run(updateTask(supabase, task.id, { status: 'planned', scheduled_date: todayDate(), carry_count: 0 })), true)}
              {action(t.carry_backlog, () => void run(updateTask(supabase, task.id, { status: 'backlog', scheduled_date: null })))}
              {action(t.carry_delete, () => void run(deleteTask(supabase, task.id)))}
            </View>
          </View>
        ))}
      </View>
    </GlassCard>
  )
}
