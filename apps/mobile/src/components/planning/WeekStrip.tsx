import { useMemo } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { toDateString } from '@lifeos/shared'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius, MIN_TOUCH } from '@/src/theme/tokens'

/**
 * Şerit üzerindeki yatay kaydırma haftayı değiştirir. Ana sekme kaydırmasından (30) erken
 * etkinleşir ki şeritte başlayan hareket sekmeyi değil haftayı çevirsin. Dikey sınır sekmeninkinden
 * (20) geniş: çapraz harekette önce sekme kaydırması düşer, hafta hareketi aday kalır.
 */
const SWIPE_ACTIVATE = 15
const SWIPE_VERTICAL_LIMIT = 25
const SWIPE_SHIFT = 50

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
 * hap, bugün ince çerçeveli; nokta o günde blok olduğunu söyler. Şerit yana kaydırılınca
 * hafta değişir.
 */
export function WeekStrip({ days, selectedDate, today, hasBlocks, onSelect, onShiftWeek }: Props) {
  const { colors } = useTheme()
  const { t, lang } = useLang()
  const names = t.routines_day_names.split(',')

  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-SWIPE_ACTIVATE, SWIPE_ACTIVATE])
        .failOffsetY([-SWIPE_VERTICAL_LIMIT, SWIPE_VERTICAL_LIMIT])
        .runOnJS(true)
        .onEnd((event, success) => {
          if (!success || Math.abs(event.translationX) < SWIPE_SHIFT) return
          onShiftWeek(event.translationX < 0 ? 1 : -1)
        }),
    [onShiftWeek],
  )

  const arrow = (weeks: -1 | 1) => (
    <TouchableOpacity
      onPress={() => onShiftWeek(weeks)}
      accessibilityRole="button"
      accessibilityLabel={weeks < 0 ? t.ux_plan_prev_week : t.ux_plan_next_week}
      style={{ width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name={weeks < 0 ? 'chevron-back' : 'chevron-forward'} size={20} color={colors.textSubtle} />
    </TouchableOpacity>
  )

  // Ay başlığı haftanın ortasından (Perşembe): ay geçişindeki haftada çoğunluğun ayı.
  const month = days[3]?.toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', { month: 'long', year: 'numeric' }) ?? ''

  return (
    <View style={{ marginBottom: spacing[4] }}>
    {/* Oklar ayrı satırda: şeritte yedi gün 360dp ekranda da 44dp genişlik alsın (DESIGN 3). */}
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: -spacing[2] }}>
      <Text style={{ flex: 1, fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textMuted }}>{month}</Text>
      {arrow(-1)}
      {arrow(1)}
    </View>
    <GestureDetector gesture={swipe}>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {days.map((day) => {
        const date = toDateString(day)
        const selected = date === selectedDate
        const isToday = date === today
        return (
          <TouchableOpacity key={date} onPress={() => onSelect(date)} style={{ flex: 1, minHeight: MIN_TOUCH }}
            accessibilityRole="button" accessibilityState={{ selected }}>
            <View style={{
              marginHorizontal: 1, minHeight: MIN_TOUCH, paddingVertical: spacing[2], borderRadius: radius.lg, alignItems: 'center', gap: 2,
              backgroundColor: selected ? palette.accent : 'transparent',
              borderWidth: isToday && !selected ? 1 : 0, borderColor: `${palette.accent}66`,
            }}>
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: selected ? 'rgba(255,255,255,0.85)' : colors.textSubtle }}>
                {names[day.getDay()]}
              </Text>
              <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: selected ? '#fff' : isToday ? palette.accent : colors.textPrimary }}>
                {day.getDate()}
              </Text>
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: hasBlocks(date) ? (selected ? '#fff' : palette.accent) : 'transparent' }} />
            </View>
          </TouchableOpacity>
        )
      })}
    </View>
    </GestureDetector>
    </View>
  )
}
