import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import type { CreateRoutineInput, Routine } from '@lifeos/shared'
import { useRoutineStore } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { RoutineSheet, WEEKDAY_ORDER } from '@/src/components/planning/RoutineSheet'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

interface Props {
  userId: string
  blockColors: Record<string, string>
  /** Seri değişti: takvimdeki örnekleri yeniden okumak için. */
  onChanged: () => void
}

/** "Haftam": rutin şablonları. Örnekleri sunucu üretir, burası sadece şablonu düzenler. */
export function WeeklyRoutines({ userId, blockColors, onChanged }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  const { routines, loading, fetchRoutines, addRoutine, updateSeries, removeRoutine } = useRoutineStore()
  const [editing, setEditing] = useState<Routine | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => { void fetchRoutines(supabase, userId) }, [fetchRoutines, userId])

  const names = t.routines_day_names.split(',')
  // Haftanın akışıyla oku: ilk günü ve saate göre; günü olmayan alışkanlıklar sonda.
  const firstDay = (r: Routine) => Math.min(...r.days_of_week.map((d) => WEEKDAY_ORDER.indexOf(d)), 7)
  const active = routines.filter((r) => r.is_active)
    .sort((a, b) => firstDay(a) - firstDay(b) || (a.start_time ?? '').localeCompare(b.start_time ?? ''))
  const open = (r: Routine | null) => { setEditing(r); setSheetOpen(true) }

  const describe = (r: Routine): string => {
    if (r.kind === 'habit') return t.routines_habit_target.replace('{n}', String(r.times_per_week ?? 1))
    const days = WEEKDAY_ORDER.filter((d) => r.days_of_week.includes(d)).map((d) => names[d]).join(' ')
    const time = r.start_time ? ` · ${r.start_time.slice(0, 5)}` : ''
    const every = r.every_n_weeks > 1 ? ` · ${t.routines_biweekly}` : ''
    return `${days}${time}${every}`
  }

  const handleSave = async (input: CreateRoutineInput) => {
    if (editing) await updateSeries(supabase, editing.id, input)
    else await addRoutine(supabase, userId, input)
    onChanged()
  }

  const handleDelete = async () => {
    if (!editing) return
    await removeRoutine(supabase, editing.id)
    onChanged()
  }

  return (
    <GlassCard style={{ marginBottom: spacing[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[2] }}>
        <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{t.routines_title}</Text>
        <TouchableOpacity onPress={() => open(null)} accessibilityLabel={t.routines_add}
          style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: `${palette.accent}18`, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="add" size={18} color={palette.accent} />
        </TouchableOpacity>
      </View>
      <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, marginBottom: spacing[3] }}>{t.routines_subtitle}</Text>

      {!loading && active.length === 0 ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle, textAlign: 'center', paddingVertical: spacing[3] }}>{t.routines_empty}</Text>
      ) : (
        <View style={{ gap: spacing[2] }}>
          {active.map((r) => (
            <TouchableOpacity key={r.id} onPress={() => open(r)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[2], borderRadius: radius.md, backgroundColor: colors.glassInner }}>
              <View style={{ width: 3, height: 30, borderRadius: 2, backgroundColor: r.kind === 'habit' ? palette.accent : (r.color ?? blockColors[r.block_type] ?? palette.accent) }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }} numberOfLines={1}>{r.title}</Text>
                <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>{describe(r)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.textSubtle} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <RoutineSheet visible={sheetOpen} routine={editing}
        onClose={() => setSheetOpen(false)}
        onSave={handleSave}
        onDelete={editing ? handleDelete : undefined} />
    </GlassCard>
  )
}
