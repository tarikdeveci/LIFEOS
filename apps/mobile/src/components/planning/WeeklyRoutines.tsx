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
import { palette, fontSize, fontWeight, spacing } from '@/src/theme/tokens'

const COLLAPSED = 3

interface Props {
  userId: string
  blockColors: Record<string, string>
  /** Seri değişti: takvimdeki örnekleri yeniden okumak için. */
  onChanged: () => void
}

/**
 * "Haftam": rutin şablonları. Örnekleri sunucu üretir, burası sadece şablonu düzenler.
 * İlk üçü görünür, gerisi "Tümünü göster" ile açılır.
 */
export function WeeklyRoutines({ userId, blockColors, onChanged }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  const { routines, loading, fetchRoutines, addRoutine, updateSeries, removeRoutine } = useRoutineStore()
  const [editing, setEditing] = useState<Routine | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)

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

  const shown = expanded ? active : active.slice(0, COLLAPSED)
  const kindIcon = (r: Routine) => r.kind === 'habit' ? 'leaf-outline' : r.kind === 'task' ? 'checkbox-outline' : 'repeat-outline'

  return (
    <GlassCard style={{ marginBottom: spacing[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing[2] }}>
        <Text style={{ flex: 1, fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary }}>{t.routines_title}</Text>
        <TouchableOpacity onPress={() => open(null)} accessibilityLabel={t.routines_add}
          style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: `${palette.accent}18`, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="add" size={18} color={palette.accent} />
        </TouchableOpacity>
      </View>

      {!loading && active.length === 0 ? (
        <TouchableOpacity onPress={() => open(null)} style={{ alignItems: 'center', gap: spacing[2], paddingVertical: spacing[3] }}>
          <Ionicons name="repeat-outline" size={26} color={colors.textSubtle} />
          <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' }}>{t.routines_empty}</Text>
          <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, textAlign: 'center' }}>{t.routines_subtitle}</Text>
        </TouchableOpacity>
      ) : (
        <View>
          {shown.map((r, i) => {
            const color = r.kind === 'habit' ? palette.accent : (r.color ?? blockColors[r.block_type] ?? palette.accent)
            return (
              <TouchableOpacity key={r.id} onPress={() => open(r)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: `${color}1F` }}>
                  <Ionicons name={kindIcon(r)} size={16} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }} numberOfLines={1}>{r.title}</Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 }}>{describe(r)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.textSubtle} />
              </TouchableOpacity>
            )
          })}
          {active.length > COLLAPSED && (
            <TouchableOpacity onPress={() => setExpanded((v) => !v)} hitSlop={8}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.accent }}>
                {expanded ? t.routines_show_less : t.routines_show_all.replace('{n}', String(active.length))}
              </Text>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={palette.accent} />
            </TouchableOpacity>
          )}
        </View>
      )}

      <RoutineSheet visible={sheetOpen} routine={editing}
        onClose={() => setSheetOpen(false)}
        onSave={handleSave}
        onDelete={editing ? handleDelete : undefined} />
    </GlassCard>
  )
}
