import { useCallback, useRef, type ReactNode } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import type { TimeBlock } from '@lifeos/shared'
import {
  blockTiming,
  formatDuration,
  minutesOfDay,
  minutesToClock,
  type BlockTiming,
} from '@lifeos/shared'
import { GlassCard } from '../ui/GlassCard'
import { useTheme } from '../../contexts/ThemeContext'
import { useLang } from '../../contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '../../theme/tokens'
import type { LocalCalendarEvent } from '../../utils/calendarSync'

interface Props {
  blocks: TimeBlock[]
  events: LocalCalendarEvent[]
  /** Görüntülenen gün bugün mü — değilse hiçbir "şu an" işareti çizilmez */
  isToday: boolean
  now: Date
  blockColors: Record<string, string>
  blockLabels: Record<string, string>
  onDelete: (blockId: string) => void
  /**
   * Şu ana denk gelen satırın kaydırma içeriğindeki y konumu.
   * Konteynerin kendi y'si eklenmiş halde raporlanır.
   */
  onNowAnchorLayout?: (y: number) => void
}

/**
 * Seçili günün blok listesi. Bugün görüntülenirken bloklar geçmiş/aktif/gelecek
 * olarak ayrışır ve boşluktaysak araya "şu an" çizgisi girer.
 */
export function DayBlockList({
  blocks,
  events,
  isToday,
  now,
  blockColors,
  blockLabels,
  onDelete,
  onNowAnchorLayout,
}: Props) {
  const nowMinute = minutesOfDay(now)

  // Konteynerin ve çapa satırın y'si farklı onLayout olaylarından gelir; ikisi de
  // ref'te tutulup her güncellemede birleştirilir. Aksi halde hangisinin önce
  // geldiğine bağlı olarak sıfır offset raporlanıyor.
  const containerY = useRef(0)
  const anchorY = useRef<number | null>(null)

  const emitAnchor = useCallback(() => {
    if (anchorY.current === null) return
    onNowAnchorLayout?.(containerY.current + anchorY.current)
  }, [onNowAnchorLayout])

  const reportAnchor = useCallback(
    (rowY: number) => {
      anchorY.current = rowY
      emitAnchor()
    },
    [emitAnchor],
  )

  const reportContainer = useCallback(
    (y: number) => {
      containerY.current = y
      emitAnchor()
    },
    [emitAnchor],
  )

  const timings = blocks.map((block) => blockTiming(block, isToday ? nowMinute : -1))
  const activeIndex = isToday ? timings.findIndex((timing) => timing.phase === 'active') : -1
  const nextIndex = isToday ? timings.findIndex((timing) => timing.phase === 'upcoming') : -1

  const rows: ReactNode[] = []
  let nowLineDrawn = false

  blocks.forEach((block, index) => {
    const timing = timings[index]
    if (!timing) return

    // Boşluktaysak (aktif blok yok) şu an çizgisini sıradaki bloğun önüne koy
    if (isToday && activeIndex === -1 && !nowLineDrawn && timing.startMinute > nowMinute) {
      rows.push(
        <NowLine
          key="now-line"
          nowMinute={nowMinute}
          onLayoutY={onNowAnchorLayout ? reportAnchor : undefined}
        />,
      )
      nowLineDrawn = true
    }

    rows.push(
      <BlockRow
        key={block.id}
        block={block}
        timing={timing}
        isToday={isToday}
        isNext={index === nextIndex && activeIndex === -1}
        color={blockColors[block.block_type] ?? palette.accent}
        typeLabel={blockLabels[block.block_type] ?? block.block_type}
        onDelete={() => onDelete(block.id)}
        onLayoutY={index === activeIndex && onNowAnchorLayout ? reportAnchor : undefined}
      />,
    )
  })

  // Günün tüm blokları bittiyse çizgi en sona düşer
  if (isToday && activeIndex === -1 && !nowLineDrawn && blocks.length > 0) {
    rows.push(
      <NowLine
        key="now-line"
        nowMinute={nowMinute}
        onLayoutY={onNowAnchorLayout ? reportAnchor : undefined}
      />,
    )
  }

  return (
    <View
      style={{ gap: spacing[3] }}
      onLayout={(e) => reportContainer(e.nativeEvent.layout.y)}
    >
      {rows}
      {events.map((event) => (
        <CalendarEventRow key={event.id} event={event} />
      ))}
    </View>
  )
}

function NowLine({ nowMinute, onLayoutY }: { nowMinute: number; onLayoutY?: (y: number) => void }) {
  const { t } = useLang()
  return (
    <View
      onLayout={onLayoutY ? (e) => onLayoutY(e.nativeEvent.layout.y) : undefined}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingVertical: 2 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, backgroundColor: palette.accent }}>
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#fff' }} />
        <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: '#fff', fontVariant: ['tabular-nums'] }}>
          {minutesToClock(nowMinute)}
        </Text>
      </View>
      <View style={{ flex: 1, height: 2, borderRadius: 1, backgroundColor: `${palette.accent}66` }} />
      <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: palette.accent }}>
        {t.plan_now}
      </Text>
    </View>
  )
}

interface BlockRowProps {
  block: TimeBlock
  timing: BlockTiming
  isToday: boolean
  isNext: boolean
  color: string
  typeLabel: string
  onDelete: () => void
  onLayoutY?: (y: number) => void
}

function BlockRow({ block, timing, isToday, isNext, color, typeLabel, onDelete, onLayoutY }: BlockRowProps) {
  const { colors } = useTheme()
  const { t, lang } = useLang()

  const isActive = isToday && timing.phase === 'active'
  const isPast = isToday && timing.phase === 'past'

  return (
    <View onLayout={onLayoutY ? (e) => onLayoutY(e.nativeEvent.layout.y) : undefined}>
      <GlassCard
        padding={spacing[4]}
        noShadow={!isActive}
        style={
          isActive
            ? { borderColor: color, borderWidth: 2 }
            : isPast
              ? { opacity: 0.55 }
              : undefined
        }
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
          <View style={{ width: isActive ? 4 : 3, height: 44, borderRadius: 2, backgroundColor: isPast ? colors.textSubtle : color }} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
              <Text
                style={{ flex: 1, fontSize: fontSize.base, fontWeight: isActive ? fontWeight.bold : fontWeight.medium, color: isPast ? colors.textMuted : colors.textPrimary }}
                numberOfLines={1}
              >
                {block.label ?? typeLabel}
              </Text>
              {isActive && (
                <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full, backgroundColor: color }}>
                  <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: '#fff', letterSpacing: 0.4 }}>
                    {t.plan_now_badge}
                  </Text>
                </View>
              )}
              {isPast && <Ionicons name="checkmark-circle-outline" size={14} color={colors.textSubtle} />}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: 2 }}>
              <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, fontVariant: ['tabular-nums'] }}>
                {block.start_time.slice(0, 5)} – {block.end_time.slice(0, 5)}
              </Text>
              {isActive && (
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color }}>
                  · {formatDuration(timing.remainingMinutes, lang)} {t.plan_remaining}
                </Text>
              )}
              {isNext && (
                <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle }}>
                  · {formatDuration(timing.minutesUntilStart, lang)} {t.plan_starts_in}
                </Text>
              )}
            </View>

            {isActive ? (
              <View style={{ marginTop: 8, height: 5, borderRadius: radius.full, backgroundColor: colors.border, overflow: 'hidden' }}>
                <View style={{ height: '100%', width: `${Math.round(timing.progress * 100)}%`, backgroundColor: color, borderRadius: radius.full }} />
              </View>
            ) : (
              <View style={{ marginTop: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: `${color}18` }}>
                <Text style={{ fontSize: fontSize.xs, color, fontWeight: fontWeight.medium }}>{typeLabel}</Text>
              </View>
            )}
          </View>

          <TouchableOpacity onPress={onDelete} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="trash-outline" size={16} color={colors.textSubtle} />
          </TouchableOpacity>
        </View>
      </GlassCard>
    </View>
  )
}

function CalendarEventRow({ event }: { event: LocalCalendarEvent }) {
  const { colors } = useTheme()
  const startTime = event.isAllDay
    ? 'Tüm gün'
    : new Date(event.startsAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  const endTime = event.isAllDay
    ? ''
    : ` – ${new Date(event.endsAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`

  return (
    <GlassCard padding={spacing[4]} noShadow style={{ opacity: 0.8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <View style={{ width: 3, height: 44, borderRadius: 2, backgroundColor: colors.textSubtle }} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}>
            <Ionicons name="calendar-outline" size={12} color={colors.textSubtle} />
            <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.textSecondary }} numberOfLines={1}>
              {event.title}
            </Text>
          </View>
          <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 }}>
            {startTime}{endTime}
          </Text>
          <View style={{ marginTop: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.glassInner }}>
            <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, fontWeight: fontWeight.medium }}>Takvim</Text>
          </View>
        </View>
      </View>
    </GlassCard>
  )
}
