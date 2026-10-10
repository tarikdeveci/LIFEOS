import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import type { CreateRoutineInput, Routine } from '@lifeos/shared'
import { useRoutineStore } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { CollapsibleTitle } from '@/src/components/planning/CollapsibleTitle'
import { RoutineSheet, WEEKDAY_ORDER } from '@/src/components/planning/RoutineSheet'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing } from '@/src/theme/tokens'

interface Props {
  userId: string
  blockColors: Record<string, string>
  /** Seri değişti: takvimdeki örnekleri yeniden okumak için. */
  onChanged: () => void
}

/**
 * "Haftam": rutin şablonları. Örnekleri sunucu üretir, burası sadece şablonu düzenler.
 * Bir ayar listesi olduğu için kapalı başlar; rutinler günde zaten blok olarak görünür.
 */
export function WeeklyRoutines({ userId, blockColors, onChanged }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  const { routines, progress, loading, fetchRoutines, addRoutine, updateSeries, removeRoutine } = useRoutineStore()
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
    const base = describeBase(r)
    // Program sayacı yalnız hedefi olan, ölçülen rutinde; yoksa metin birebir aynı kalır.
    if (r.target_count == null || r.is_untracked || progress[r.id] === undefined) return base
    return `${base} · ${Math.min(progress[r.id] ?? 0, r.target_count)}/${r.target_count}`
  }

  const describeBase = (r: Routine): string => {
    if (r.kind === 'habit') {
      if (r.times_per_day) return t.routines_habit_daily_target.replace('{n}', String(r.times_per_day))
      return r.times_per_week === 7 ? t.routines_habit_daily : t.routines_habit_target.replace('{n}', String(r.times_per_week ?? 1))
    }
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

  const kindIcon = (r: Routine) => r.kind === 'habit' ? 'leaf-outline' : r.kind === 'task' ? 'checkbox-outline' : 'repeat-outline'

  return (
    <GlassCard style={{ marginBottom: spacing[3] }}>
      <CollapsibleTitle title={t.routines_title} open={expanded} onToggle={() => setExpanded((v) => !v)}
        summary={active.length === 0 ? t.routines_none_yet : t.routines_count.replace('{n}', String(active.length))}
        onAdd={() => open(null)} addLabel={t.routines_add} />

      {expanded && (!loading && active.length === 0 ? (
        <TouchableOpacity onPress={() => open(null)} style={{ alignItems: 'center', gap: spacing[2], paddingVertical: spacing[3] }}>
          <Ionicons name="repeat-outline" size={26} color={colors.textSubtle} />
          <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' }}>{t.routines_empty}</Text>
          <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, textAlign: 'center' }}>{t.routines_subtitle}</Text>
        </TouchableOpacity>
      ) : (
        <View>
          {active.map((r, i) => {
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
        </View>
      ))}

      <RoutineSheet userId={userId} visible={sheetOpen} routine={editing}
        onClose={() => setSheetOpen(false)}
        onSave={handleSave}
        onDelete={editing ? handleDelete : undefined} />
    </GlassCard>
  )
}
