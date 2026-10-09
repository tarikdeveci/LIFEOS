import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useGoalStore, type Goal } from '@lifeos/shared'
import type { GoalTask } from '@lifeos/shared/supabase'
import { useLang } from '@/src/contexts/LangContext'
import { useTheme } from '@/src/contexts/ThemeContext'
import { supabase } from '@/src/lib/supabase'
import { palette, fontSize, spacing, radius } from '@/src/theme/tokens'

interface GoalStepsProps { goal: Goal; userId: string }

/** Hedefe bağlı adımlar: ekle, tikle. Web GoalsPanel'deki adım listesinin karşılığı. */
export function GoalSteps({ goal, userId }: GoalStepsProps) {
  const { t } = useLang()
  const { colors } = useTheme()
  const { tasks, addStep, setStepDone } = useGoalStore()
  const [state, setState] = useState({ open: false, draft: '', saving: false, error: false })
  const steps = tasks.filter((task) => task.goal_id === goal.id)
  const doneCount = steps.filter((s) => s.status === 'done').length
  const patch = (p: Partial<typeof state>) => setState((s) => ({ ...s, ...p }))

  const submit = async () => {
    const title = state.draft.trim()
    if (!title || state.saving) return
    patch({ saving: true, error: false })
    try {
      await addStep(supabase, userId, goal.id, title)
      patch({ draft: '' })
    } catch { patch({ error: true }) } finally { patch({ saving: false }) }
  }

  const toggle = async (step: GoalTask) => {
    patch({ error: false })
    try { await setStepDone(supabase, step.id, step.status !== 'done') } catch { patch({ error: true }) }
  }

  return (
    <View style={{ marginTop: spacing[2], gap: spacing[2] }}>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: state.open }} hitSlop={8}
        onPress={() => patch({ open: !state.open })}>
        <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>
          {state.open ? '▾' : '▸'} {t.goal_steps}{steps.length > 0 ? ` ${doneCount}/${steps.length}` : ''}
        </Text>
      </TouchableOpacity>
      {state.error && <Text accessibilityRole="alert" style={{ color: palette.danger, fontSize: fontSize.xs }}>{t.goal_step_error}</Text>}
      {state.open && (
        <View style={{ gap: spacing[2] }}>
          {steps.length === 0 && <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>{goal.count_mode === 'units' ? t.goal_steps_empty_units : t.goal_steps_empty}</Text>}
          {steps.map((step) => {
            const done = step.status === 'done'
            return (
              <TouchableOpacity key={step.id} accessibilityRole="checkbox" accessibilityState={{ checked: done }}
                onPress={() => void toggle(step)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                <Ionicons name={done ? 'checkbox' : 'square-outline'} size={18} color={done ? palette.success : colors.textMuted} />
                <Text style={{ flex: 1, fontSize: fontSize.sm, color: done ? colors.textMuted : colors.textPrimary,
                  textDecorationLine: done ? 'line-through' : 'none' }}>{step.title}</Text>
              </TouchableOpacity>
            )
          })}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <TextInput value={state.draft} onChangeText={(draft) => patch({ draft })} maxLength={200}
              placeholder={t.goal_step_placeholder} placeholderTextColor={colors.textSubtle}
              editable={!state.saving} returnKeyType="done" onSubmitEditing={() => void submit()}
              style={{ flex: 1, padding: spacing[2], borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
                color: colors.textPrimary, fontSize: fontSize.sm }} />
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={t.goal_step_placeholder}
              disabled={state.saving || !state.draft.trim()} onPress={() => void submit()}
              style={{ padding: spacing[2], opacity: state.saving || !state.draft.trim() ? 0.4 : 1 }}>
              <Ionicons name="add-circle" size={24} color={palette.accent} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  )
}
