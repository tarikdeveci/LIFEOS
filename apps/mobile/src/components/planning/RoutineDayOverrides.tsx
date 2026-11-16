import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import type { Routine, RoutineDayOverride, Weekday } from '@lifeos/shared'
import { getRoutineDayOverrides } from '@lifeos/shared/supabase'
import { supabase } from '@/src/lib/supabase'
import { Input } from '@/src/components/ui/Input'
import { TimeField } from '@/src/components/ui/PickerField'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'
import type { DayRow, DayRows } from '@/src/planning/dayRows'

/**
 * Düzenlenen rutinin kayıtlı satırları. Yeni rutinde hemen hazır, boş liste. Sonuç hangi rutine
 * aitse onunla eşleşmedikçe 'loading' döner: başka rutin açılınca önceki satırlar forma sızmaz.
 */
export function useRoutineDayOverrides(routine: Routine | null, visible: boolean) {
  const routineId = routine && routine.kind !== 'habit' ? routine.id : null
  const [state, setState] = useState<{ forId: string | null; status: 'ready' | 'error'; overrides: RoutineDayOverride[] } | null>(null)

  useEffect(() => {
    if (!visible || !routineId) return
    let alive = true
    getRoutineDayOverrides(supabase, routineId)
      .then((overrides) => { if (alive) setState({ forId: routineId, status: 'ready', overrides }) })
      .catch(() => { if (alive) setState({ forId: routineId, status: 'error', overrides: [] }) })
    return () => { alive = false; setState(null) }
  }, [visible, routineId])

  if (!routineId) return READY_EMPTY
  if (!state || state.forId !== routineId) return LOADING
  return state
}

const READY_EMPTY = { status: 'ready' as const, overrides: [] as RoutineDayOverride[] }
const LOADING = { status: 'loading' as const, overrides: [] as RoutineDayOverride[] }

interface Props {
  /** Seçili günler, ekrandaki sırayla (Pazartesi başta). */
  days: Weekday[]
  rows: DayRows
  onChange: (rows: DayRows) => void
  /** Şablonun saati: "Saat" seçilince alanlar bununla dolar. */
  start: string
  end: string
}

/** "Günlere göre farklı" açıkken her seçili gün için Aynı, Saat ya da Süre. */
export function RoutineDayOverridesEditor({ days, rows, onChange, start, end }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  const names = t.routines_day_names.split(',')

  const setRow = (d: Weekday, row: DayRow | null) => {
    const next = { ...rows }
    if (row) next[d] = row
    else delete next[d]
    onChange(next)
  }

  const chip = (active: boolean) => ({
    paddingHorizontal: spacing[3], paddingVertical: 8, borderRadius: radius.md, borderWidth: 1,
    backgroundColor: active ? palette.accent : colors.glassInner,
    borderColor: active ? palette.accent : colors.border,
  })
  const chipText = (active: boolean) => ({ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: active ? '#fff' : colors.textMuted })

  const modes: [DayRow['mode'] | 'same', string][] = [
    ['same', t.routines_per_day_same], ['time', t.routines_per_day_time], ['minutes', t.routines_per_day_minutes],
  ]

  return (
    <View style={{ gap: spacing[3] }}>
      {days.map((d) => {
        const row = rows[d]
        const current = row?.mode ?? 'same'
        return (
          <View key={d} style={{ gap: spacing[2] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
              <Text style={{ width: 40, fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{names[d]}</Text>
              {modes.map(([m, label]) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => setRow(d, m === 'same' ? null : { mode: m, start: row?.start || start, end: row?.end || end, minutes: row?.minutes ?? '' })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: current === m }}
                  accessibilityLabel={`${names[d]} ${label}`}
                  hitSlop={{ top: 6, bottom: 6 }}
                  style={chip(current === m)}
                >
                  <Text style={chipText(current === m)}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {row?.mode === 'time' && (
              <View style={{ flexDirection: 'row', gap: spacing[3] }}>
                <TimeField label={t.routines_start} value={row.start} onChange={(v) => setRow(d, { ...row, start: v })} defaultTime={start || '09:00'} containerStyle={{ flex: 1 }} />
                <TimeField label={t.routines_end} value={row.end} onChange={(v) => setRow(d, { ...row, end: v })} defaultTime={row.start || end || '10:00'} containerStyle={{ flex: 1 }} />
              </View>
            )}
            {row?.mode === 'minutes' && (
              <Input label={t.routines_per_day_minutes_label} value={row.minutes} keyboardType="number-pad"
                onChangeText={(v) => setRow(d, { ...row, minutes: v.replace(/\D/g, '').slice(0, 4) })} />
            )}
          </View>
        )
      })}
    </View>
  )
}
