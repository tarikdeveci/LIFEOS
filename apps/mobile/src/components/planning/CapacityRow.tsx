import { useState } from 'react'
import { View, Text, TouchableOpacity, Alert } from 'react-native'
import {
  DEFAULT_WORKDAY, dayCapacity, formatDuration, minutesOfDay, shiftRemaining, usePlanningStore,
} from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

const DELAYS = [10, 15, 30, 60] as const

/** Günün kalanı: kapasite çubuğu ve "Geciktim". NowCard'ın alt satırı olarak durur. */
export function CapacityRow() {
  const { colors } = useTheme()
  const { t, lang } = useLang()
  const { flexTasks, carryoverTasks, timeBlocks, busy, applyShift } = usePlanningStore()
  const [shiftOpen, setShiftOpen] = useState(false)

  const unblocked = [...flexTasks, ...carryoverTasks].filter((task) => !timeBlocks.some((b) => b.task_id === task.id))
  const cap = dayCapacity(unblocked, timeBlocks, { from: minutesOfDay(), busy })
  const pct = Math.min(100, Math.round((Number.isFinite(cap.ratio) ? cap.ratio : 1) * 100))

  const shift = async (delay: number) => {
    setShiftOpen(false)
    const result = shiftRemaining(timeBlocks, delay, minutesOfDay())
    if (result.updates.length === 0) { Alert.alert(t.shift_nothing); return }
    try {
      await applyShift(supabase, result.updates)
      const notes = [t.shift_done.replace('{n}', String(result.updates.length))]
      if (result.pastDayEnd) notes.push(t.shift_past_end.replace('{end}', DEFAULT_WORKDAY.end))
      if (result.overflow.length > 0) notes.push(t.shift_overflow.replace('{n}', String(result.overflow.length)))
      Alert.alert(notes.join('\n'))
    } catch { Alert.alert(t.shift_error) }
  }

  return (
    <View style={{ marginTop: spacing[3], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        <Text style={{ flex: 1, fontSize: fontSize.xs, color: colors.textSubtle }} numberOfLines={1}>
          <Text style={{ fontWeight: fontWeight.semibold, color: colors.textMuted }}>{t.cap_title}</Text>
          {'  '}{t.cap_summary.replace('{planned}', formatDuration(cap.plannedMinutes, lang)).replace('{free}', formatDuration(cap.availableMinutes, lang))}
        </Text>
        <TouchableOpacity onPress={() => setShiftOpen((v) => !v)} accessibilityLabel={t.shift_title}
          style={{ paddingHorizontal: spacing[3], paddingVertical: 4, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, fontWeight: fontWeight.medium }}>{t.shift_btn}</Text>
        </TouchableOpacity>
      </View>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.glassInner, marginTop: spacing[2] }}>
        <View style={{ height: 4, borderRadius: 2, width: `${pct}%`, backgroundColor: cap.overloaded ? palette.warning : palette.accent }} />
      </View>
      {cap.overloaded && <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing[2] }}>{t.cap_over}</Text>}
      {shiftOpen && (
        <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] }}>
          {DELAYS.map((d) => (
            <TouchableOpacity key={d} onPress={() => void shift(d)}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: radius.md, backgroundColor: `${palette.accent}18` }}>
              <Text style={{ fontSize: fontSize.xs, color: palette.accent, fontWeight: fontWeight.semibold }}>+{d} dk</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  )
}
