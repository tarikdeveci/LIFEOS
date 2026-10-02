import { View, Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { WEEKDAY_ORDER, estimateWorkoutMinutes } from '@lifeos/shared'
import type { WorkoutProgram } from '@lifeos/shared'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { useTheme } from '../../contexts/ThemeContext'
import { useLang } from '../../contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '../../theme/tokens'
import { activeDays, programDayLabel } from './programDays'

interface Props {
  /** Detay sayfasında açık olan programın güncel kaydı. */
  program: WorkoutProgram | null
  startDate: string
  onChangeStartDate: (value: string) => void
  time: string
  onChangeTime: (value: string) => void
  weeks: string
  onChangeWeeks: (value: string) => void
  /** Her program gününe atanan hafta günü (anahtar: program günü kimliği). */
  weekdays: Record<string, number>
  onPickWeekday: (dayId: string, weekday: number) => void
  toBlocks: boolean
  onToggleBlocks: () => void
  toCalendar: boolean
  onToggleCalendar: () => void
  scheduling: boolean
  onSchedule: () => void
  onBack: () => void
}

interface TargetToggleProps {
  label: string
  hint: string
  value: boolean
  onToggle: () => void
}

/** Programı takvime yerleştirme: program detayında gün listesinin yerini alan planlayıcı. */
export function ProgramPlannerView({
  program, startDate, onChangeStartDate, time, onChangeTime, weeks, onChangeWeeks, weekdays, onPickWeekday,
  toBlocks, onToggleBlocks, toCalendar, onToggleCalendar, scheduling, onSchedule, onBack,
}: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  const weekdayNames = t.routines_day_names.split(',')

  return (
    <View style={{ gap: spacing[3] }}>
      <TouchableOpacity
        onPress={onBack}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}
      >
        <Ionicons name="chevron-back" size={16} color={palette.accent} />
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.accent }}>{t.wk_back_to_program}</Text>
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        <Input label={t.wk_start_date} value={startDate} onChangeText={onChangeStartDate} placeholder="2026-09-08" containerStyle={{ flex: 1.5 }} />
        <Input label={t.wk_time} value={time} onChangeText={onChangeTime} placeholder="18:00" containerStyle={{ flex: 1 }} />
        <Input label={t.wk_weeks} value={weeks} onChangeText={onChangeWeeks} keyboardType="number-pad" containerStyle={{ flex: 0.8 }} />
      </View>

      {/* Her antrenman gününe bir hafta günü. Varsayılan dağılım
          spreadWeekdays'ten geliyor (3 gün → Pzt/Çar/Cum). */}
      {activeDays(program).map((day) => {
        const minutes = estimateWorkoutMinutes(
          (day.exercises ?? []).map((ex) => ({ sets: ex.sets, rest_seconds: ex.rest_seconds })),
        )
        return (
          <View key={day.id} style={{ gap: spacing[2] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
                {programDayLabel(day, t)}
              </Text>
              <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{t.wk_approx_min.replace('{n}', String(minutes))}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {WEEKDAY_ORDER.map((weekday) => {
                const active = weekdays[day.id] === weekday
                return (
                  <TouchableOpacity
                    key={weekday}
                    onPress={() => onPickWeekday(day.id, weekday)}
                    style={{ flex: 1, paddingVertical: 7, borderRadius: radius.md, alignItems: 'center', backgroundColor: active ? palette.workout : colors.glassInner, borderWidth: 1, borderColor: active ? palette.workout : colors.border }}
                  >
                    <Text style={{ fontSize: fontSize.xs, fontWeight: active ? fontWeight.semibold : fontWeight.regular, color: active ? '#fff' : colors.textMuted }}>
                      {weekdayNames[weekday]}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        )
      })}

      <TargetToggle
        label={t.wk_to_blocks}
        hint={t.wk_to_blocks_hint}
        value={toBlocks}
        onToggle={onToggleBlocks}
      />
      <TargetToggle
        label={t.wk_to_calendar}
        hint={t.wk_to_calendar_hint}
        value={toCalendar}
        onToggle={onToggleCalendar}
      />

      <Button
        label={scheduling ? t.wk_scheduling : t.wk_schedule}
        onPress={onSchedule}
        loading={scheduling}
        fullWidth
      />
    </View>
  )
}

/** Program planlayıcıdaki "nereye yazılsın" seçeneği. */
function TargetToggle({ label, hint, value, onToggle }: TargetToggleProps) {
  const { colors } = useTheme()
  return (
    <TouchableOpacity
      onPress={onToggle}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], paddingHorizontal: spacing[3], borderRadius: radius.lg, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: value ? palette.workout : colors.border }}
    >
      <Ionicons
        name={value ? 'checkbox' : 'square-outline'}
        size={20}
        color={value ? palette.workout : colors.textSubtle}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{label}</Text>
        <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 }}>{hint}</Text>
      </View>
    </TouchableOpacity>
  )
}
