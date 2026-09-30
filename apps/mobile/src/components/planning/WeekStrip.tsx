import { View, Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { toDateString } from '@lifeos/shared'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing } from '@/src/theme/tokens'

interface Props {
  /** Pazartesiden başlayan yedi gün. */
  days: Date[]
  selectedDate: string
  today: string
  hasBlocks: (date: string) => boolean
  onSelect: (date: string) => void
  onShiftWeek: (weeks: -1 | 1) => void
}

/** Gün seçici: planlama ekranının gezinmesi, bu yüzden en üstte. Oklar haftayı kaydırır. */
export function WeekStrip({ days, selectedDate, today, hasBlocks, onSelect, onShiftWeek }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  const names = t.routines_day_names.split(',')

  const arrow = (weeks: -1 | 1) => (
    <TouchableOpacity onPress={() => onShiftWeek(weeks)} hitSlop={10} style={{ justifyContent: 'center', paddingHorizontal: 2 }}>
      <Ionicons name={weeks < 0 ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.textMuted} />
    </TouchableOpacity>
  )

  return (
    <GlassCard style={{ marginBottom: spacing[4] }} padding={spacing[3]}>
      <View style={{ flexDirection: 'row' }}>
        {arrow(-1)}
        {days.map((day) => {
          const date = toDateString(day)
          const selected = date === selectedDate
          const isToday = date === today
          return (
            <TouchableOpacity key={date} onPress={() => onSelect(date)} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, fontWeight: fontWeight.medium }}>{names[day.getDay()]}</Text>
              <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? palette.accent : isToday ? `${palette.accent}18` : 'transparent', borderWidth: isToday && !selected ? 1 : 0, borderColor: palette.accent }}>
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: selected ? '#fff' : isToday ? palette.accent : colors.textSecondary }}>{day.getDate()}</Text>
              </View>
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: hasBlocks(date) ? (selected ? palette.accent : colors.textSubtle) : 'transparent' }} />
            </TouchableOpacity>
          )
        })}
        {arrow(1)}
      </View>
    </GlassCard>
  )
}
