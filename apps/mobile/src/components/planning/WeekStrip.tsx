import { View, Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { toDateString } from '@lifeos/shared'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

interface Props {
  /** Pazartesiden başlayan yedi gün. */
  days: Date[]
  selectedDate: string
  today: string
  hasBlocks: (date: string) => boolean
  onSelect: (date: string) => void
  onShiftWeek: (weeks: -1 | 1) => void
}

/**
 * Gün seçici. Kart çerçevesi yok: ekranın gezinmesi, içerik değil. Seçili gün dolu
 * hap, bugün ince çerçeveli; nokta o günde blok olduğunu söyler.
 */
export function WeekStrip({ days, selectedDate, today, hasBlocks, onSelect, onShiftWeek }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  const names = t.routines_day_names.split(',')

  const arrow = (weeks: -1 | 1) => (
    <TouchableOpacity onPress={() => onShiftWeek(weeks)} hitSlop={10} style={{ justifyContent: 'center', paddingHorizontal: 2 }}>
      <Ionicons name={weeks < 0 ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.textSubtle} />
    </TouchableOpacity>
  )

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing[4] }}>
      {arrow(-1)}
      {days.map((day) => {
        const date = toDateString(day)
        const selected = date === selectedDate
        const isToday = date === today
        return (
          <TouchableOpacity key={date} onPress={() => onSelect(date)} style={{ flex: 1, alignItems: 'center' }}
            accessibilityRole="button" accessibilityState={{ selected }}>
            <View style={{
              width: 42, paddingVertical: spacing[2], borderRadius: radius.lg, alignItems: 'center', gap: 2,
              backgroundColor: selected ? palette.accent : 'transparent',
              borderWidth: isToday && !selected ? 1 : 0, borderColor: `${palette.accent}66`,
            }}>
              <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: selected ? 'rgba(255,255,255,0.85)' : colors.textSubtle }}>
                {names[day.getDay()]}
              </Text>
              <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.bold, color: selected ? '#fff' : isToday ? palette.accent : colors.textPrimary }}>
                {day.getDate()}
              </Text>
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: hasBlocks(date) ? (selected ? '#fff' : palette.accent) : 'transparent' }} />
            </View>
          </TouchableOpacity>
        )
      })}
      {arrow(1)}
    </View>
  )
}
