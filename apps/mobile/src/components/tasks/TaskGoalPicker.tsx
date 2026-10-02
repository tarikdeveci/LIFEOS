import { useEffect } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import { goalPeriodStart, todayDate, useGoalStore } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

interface Props {
  userId: string
  goalId: string | null
  onChange: (goalId: string | null) => void
}

/** Görevi bu dönemin aktif hedeflerinden birine bağlar (hafta, ay, çeyrek). */
export function TaskGoalPicker({ userId, goalId, onChange }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  const { goals, loading, fetchGoals } = useGoalStore()
  const today = todayDate()

  useEffect(() => {
    if (goals.length === 0 && !loading) void fetchGoals(supabase, userId)
    // Sadece açılışta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const options = goals.filter((g) =>
    g.id === goalId || (g.status === 'active' && g.period_start === goalPeriodStart(g.horizon, today)),
  )
  if (options.length === 0) return null

  const chip = (active: boolean) => ({
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1,
    backgroundColor: active ? palette.accent : colors.glassInner,
    borderColor: active ? palette.accent : colors.border,
  })
  const chipText = (active: boolean) => ({
    fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: active ? '#fff' : colors.textMuted,
  })

  return (
    <View>
      <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing[2] }}>{t.goals_field}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        <TouchableOpacity onPress={() => onChange(null)} style={chip(goalId === null)}>
          <Text style={chipText(goalId === null)}>{t.goals_none}</Text>
        </TouchableOpacity>
        {options.map((g) => (
          <TouchableOpacity key={g.id} onPress={() => onChange(g.id)} style={chip(goalId === g.id)}>
            <Text style={chipText(goalId === g.id)} numberOfLines={1}>{g.icon ?? '🎯'} {g.title}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}
