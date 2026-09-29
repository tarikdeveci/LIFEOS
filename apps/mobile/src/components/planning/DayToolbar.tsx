import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, Alert } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import {
  DEFAULT_WORKDAY, dayCapacity, formatDuration, minutesOfDay, shiftRemaining, usePlanningStore,
} from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Button } from '@/src/components/ui/Button'
import { RitualSheet } from '@/src/components/planning/RitualSheet'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

const DELAYS = [10, 15, 30, 60] as const

interface Props { userId: string }

/**
 * Bugünün planlama araçları: sabah ritüeli çağrısı, kapasite çubuğu ve "Geciktim".
 * Sabah bildirimi `?ritual=1` ile açar (notifications/setup.ts).
 */
export function DayToolbar({ userId }: Props) {
  const { colors } = useTheme()
  const { t, lang } = useLang()
  const { ritual } = useLocalSearchParams<{ ritual?: string }>()
  const { dailyPlan, flexTasks, carryoverTasks, timeBlocks, busy, completeRitual, applyShift } = usePlanningStore()
  const [ritualOpen, setRitualOpen] = useState(false)
  const [shiftOpen, setShiftOpen] = useState(false)

  const ritualPending = !!dailyPlan && !dailyPlan.ritual_completed_at
  useEffect(() => { if (ritual === '1' && ritualPending) setRitualOpen(true) }, [ritual, ritualPending])

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
    <>
      {ritualPending && (
        <GlassCard style={{ marginBottom: spacing[4] }}>
          <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing[3] }}>{t.ritual_banner}</Text>
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <Button label={t.ritual_start} onPress={() => setRitualOpen(true)} size="sm" />
            <Button label={t.ritual_skip} onPress={() => void completeRitual(supabase).catch(() => Alert.alert(t.ritual_error))} size="sm" variant="ghost" />
          </View>
        </GlassCard>
      )}

      <GlassCard style={{ marginBottom: spacing[4] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{t.cap_title}</Text>
          <TouchableOpacity onPress={() => setShiftOpen((v) => !v)} accessibilityLabel={t.shift_title}
            style={{ paddingHorizontal: spacing[3], paddingVertical: 4, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, fontWeight: fontWeight.medium }}>{t.shift_btn}</Text>
          </TouchableOpacity>
        </View>
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
        <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, marginTop: spacing[2] }}>
          {t.cap_summary.replace('{planned}', formatDuration(cap.plannedMinutes, lang)).replace('{free}', formatDuration(cap.availableMinutes, lang))}
        </Text>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.glassInner, marginTop: spacing[2] }}>
          <View style={{ height: 6, borderRadius: 3, width: `${pct}%`, backgroundColor: cap.overloaded ? palette.warning : palette.accent }} />
        </View>
        {cap.overloaded && <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing[2] }}>{t.cap_over}</Text>}
      </GlassCard>

      <RitualSheet userId={userId} visible={ritualOpen} onClose={() => setRitualOpen(false)} />
    </>
  )
}
