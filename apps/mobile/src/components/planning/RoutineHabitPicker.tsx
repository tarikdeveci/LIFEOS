import { View, Text, TouchableOpacity } from 'react-native'
import { habitLinkOptions, useRoutineStore } from '@lifeos/shared'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius, MIN_TOUCH } from '@/src/theme/tokens'

interface Props {
  habitId: string | null
  onChange: (habitId: string | null) => void
}

/** Blok rutinini kullanıcının bir alışkanlığına bağlar (083); alışkanlık yoksa hiç görünmez. */
export function RoutineHabitPicker({ habitId, onChange }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  const routines = useRoutineStore((s) => s.routines)
  const options = habitLinkOptions(routines, habitId)
  if (options.length === 0) return null

  const chip = (active: boolean) => ({
    minHeight: MIN_TOUCH, justifyContent: 'center' as const,
    paddingHorizontal: spacing[3], borderRadius: radius.md, borderWidth: 1,
    backgroundColor: active ? palette.accent : colors.glassInner,
    borderColor: active ? palette.accent : colors.border,
  })
  const chipText = (active: boolean) => ({
    fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: active ? '#fff' : colors.textMuted,
  })

  return (
    <View>
      <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textMuted, marginBottom: spacing[2] }}>
        {t.ux_routine_habit}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: habitId === null }} onPress={() => onChange(null)} style={chip(habitId === null)}>
          <Text style={chipText(habitId === null)}>{t.ux_routine_habit_none}</Text>
        </TouchableOpacity>
        {options.map((h) => (
          <TouchableOpacity key={h.id} accessibilityRole="button" accessibilityState={{ selected: habitId === h.id }} onPress={() => onChange(h.id)} style={chip(habitId === h.id)}>
            <Text style={chipText(habitId === h.id)} numberOfLines={1}>{h.title}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {habitId !== null && (
        <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing[2] }}>{t.ux_routine_habit_hint}</Text>
      )}
    </View>
  )
}
