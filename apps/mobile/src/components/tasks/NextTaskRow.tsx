import { View, Text, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native'
import { router } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import type { Task } from '@lifeos/shared'
import { nearestPendingTask, relativeDateLabel, taskDateKey, todayDate } from '@lifeos/shared'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius, MIN_TOUCH } from '@/src/theme/tokens'

interface Props { tasks: readonly Task[]; style?: StyleProp<ViewStyle> }

/**
 * En yakın bekleyen görev (#33): tarihi en yakın (gecikmiş önce), tarihsizse en öncelikli.
 * Bugün ve Planlama'da görev ile takvim arasındaki bağı gösterir; dokununca görevi açar.
 */
export function NextTaskRow({ tasks, style }: Props) {
  const { colors } = useTheme()
  const { t, lang } = useLang()
  const task = nearestPendingTask(tasks)
  if (!task) return null

  const key = taskDateKey(task)
  const when = key === null ? null : key < todayDate() ? t.ux_next_task_overdue : relativeDateLabel(key, lang)
  const overdue = key !== null && key < todayDate()
  const label = when ? `${t.ux_next_task}: ${task.title}, ${when}` : `${t.ux_next_task}: ${task.title}`

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => router.push(`/task/${task.id}` as never)}
      style={[{ minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: radius.md, backgroundColor: colors.glassInner }, style]}
    >
      <Ionicons name="arrow-forward-circle-outline" size={18} color={palette.accent} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>{t.ux_next_task}</Text>
        <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.textPrimary }} numberOfLines={1}>{task.title}</Text>
      </View>
      {when && (
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: overdue ? palette.danger : colors.textMuted }}>{when}</Text>
      )}
      <Ionicons name="chevron-forward" size={14} color={colors.textSubtle} />
    </TouchableOpacity>
  )
}
