import { useCallback, useRef, type ReactNode } from 'react'
import { View, Text, TouchableOpacity, Alert } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import type { TimeBlock } from '@lifeos/shared'
import {
  blockTiming,
  formatDuration,
  minutesOfDay,
  minutesToClock,
  useFocusStore,
  type BlockTiming,
} from '@lifeos/shared'
import { GlassCard } from '../ui/GlassCard'
import { TaskCheckbox } from '../ui/TaskCheckbox'
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
  /** Bloğu tek dokunuşla tamamlandı/geri al. */
  onToggleDone: (blockId: string, done: boolean) => void
  /**
   * Şu ana denk gelen satırın kaydırma içeriğindeki y konumu.
   * Konteynerin kendi y'si eklenmiş halde raporlanır.
   */
  onNowAnchorLayout?: (y: number) => void
  /** Başlığın altındaki satır (bugün için kapasite). */
  header?: ReactNode
  /** Gün boşken listenin yerine geçer. */
  emptyContent?: ReactNode
}

const TIME_COL = 44

type Item =
  | { kind: 'block'; start: number; block: TimeBlock; timing: BlockTiming; index: number }
  | { kind: 'event'; start: number; event: LocalCalendarEvent }

const eventStart = (event: LocalCalendarEvent) => {
  const d = new Date(event.startsAt)
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * Seçili günün programı: bloklar ve takvim etkinlikleri tek kartta, saate göre
 * sıralı bir zaman çizelgesi. Bugün boşluktaysak araya "şu an" çizgisi girer.
 */
export function DayBlockList({
  blocks, events, isToday, now, blockColors, blockLabels, onDelete, onToggleDone, onNowAnchorLayout, header, emptyContent,
}: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  const nowMinute = minutesOfDay(now)

  // Kart, liste ve çapa satırının y'si farklı onLayout olaylarından gelir; hepsi
  // ref'te tutulup her güncellemede toplanır. Aksi halde hangisinin önce geldiğine
  // bağlı olarak eksik offset raporlanıyor.
  const cardY = useRef(0)
  const listY = useRef(0)
  const anchorY = useRef<number | null>(null)

  const emitAnchor = useCallback(() => {
    if (anchorY.current === null) return
    onNowAnchorLayout?.(cardY.current + listY.current + anchorY.current)
  }, [onNowAnchorLayout])

  const track = useCallback((ref: { current: number | null }) => (y: number) => {
    ref.current = y
    emitAnchor()
  }, [emitAnchor])
  const reportAnchor = onNowAnchorLayout ? track(anchorY) : undefined

  const timings = blocks.map((block) => blockTiming(block, isToday ? nowMinute : -1))
  const activeIndex = isToday ? timings.findIndex((timing) => timing.phase === 'active') : -1
  const nextIndex = isToday ? timings.findIndex((timing) => timing.phase === 'upcoming') : -1

  const allDay = events.filter((e) => e.isAllDay)
  const items: Item[] = [
    ...blocks.flatMap((block, index): Item[] => {
      const timing = timings[index]
      return timing ? [{ kind: 'block', start: timing.startMinute, block, timing, index }] : []
    }),
    ...events.filter((e) => !e.isAllDay).map((event): Item => ({ kind: 'event', start: eventStart(event), event })),
  ].sort((a, b) => a.start - b.start)

  const rows: ReactNode[] = allDay.map((event) => <EventRow key={event.id} event={event} />)
  // Boşluktaysak (aktif blok yok) çizgi şu andan sonra başlayan ilk satırın önüne,
  // hepsi geçtiyse en sona düşer.
  let nowLineDrawn = !isToday || activeIndex !== -1 || blocks.length === 0
  const nowLine = () => <NowLine key="now-line" nowMinute={nowMinute} onLayoutY={reportAnchor} />

  items.forEach((item) => {
    if (!nowLineDrawn && item.start > nowMinute) { rows.push(nowLine()); nowLineDrawn = true }
    if (item.kind === 'event') { rows.push(<EventRow key={item.event.id} event={item.event} />); return }
    const { block, timing, index } = item
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
        onToggleDone={() => onToggleDone(block.id, !block.completed_at)}
        onLayoutY={index === activeIndex ? reportAnchor : undefined}
      />,
    )
  })
  if (!nowLineDrawn) rows.push(nowLine())

  const doneCount = blocks.filter((b) => b.completed_at).length

  return (
    <View onLayout={(e) => track(cardY)(e.nativeEvent.layout.y)} style={{ marginBottom: spacing[4] }}>
      <GlassCard>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: spacing[3] }}>
          <Text style={{ flex: 1, fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary }}>{t.plan_agenda}</Text>
          {blocks.length > 0 && (
            <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: doneCount === blocks.length ? palette.success : colors.textSubtle }}>
              ✓ {doneCount}/{blocks.length}
            </Text>
          )}
        </View>
        {header}
        {rows.length === 0 ? emptyContent : (
          <View onLayout={(e) => track(listY)(e.nativeEvent.layout.y)} style={{ gap: 2 }}>{rows}</View>
        )}
      </GlassCard>
    </View>
  )
}

function NowLine({ nowMinute, onLayoutY }: { nowMinute: number; onLayoutY?: (y: number) => void }) {
  return (
    <View
      onLayout={onLayoutY ? (e) => onLayoutY(e.nativeEvent.layout.y) : undefined}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[1] }}
    >
      <Text style={{ width: TIME_COL + spacing[2], fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: palette.accent, fontVariant: ['tabular-nums'] }}>
        {minutesToClock(nowMinute)}
      </Text>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.accent }} />
      <View style={{ flex: 1, height: 2, borderRadius: 1, backgroundColor: palette.accent }} />
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
  onToggleDone: () => void
  onLayoutY?: (y: number) => void
}

function BlockRow({ block, timing, isToday, isNext, color, typeLabel, onDelete, onToggleDone, onLayoutY }: BlockRowProps) {
  const { colors } = useTheme()
  const { t, lang } = useLang()

  const isDone = block.completed_at != null
  // Tamamlanmış blok artık "şu an" ya da "sırada" değil.
  const isActive = !isDone && isToday && timing.phase === 'active'
  const faded = isDone || (isToday && timing.phase === 'past')
  // Odak zamanlayıcısıyla bu blokta gerçekten çalışılan süre (FocusCard seçili günü yükler).
  const focusMinutes = useFocusStore((s) => s.sessions.reduce((sum, x) => (x.block_id === block.id ? sum + x.minutes : sum), 0))

  const meta = [typeLabel, formatDuration(timing.endMinute - timing.startMinute, lang)]
  if (focusMinutes > 0) meta.push(`🎯 ${formatDuration(focusMinutes, lang)}`)
  const status = isActive
    ? `${formatDuration(timing.remainingMinutes, lang)} ${t.plan_remaining}`
    : isNext ? `${formatDuration(timing.minutesUntilStart, lang)} ${t.plan_starts_in}` : null

  const confirmDelete = () => {
    Alert.alert(t.plan_block_delete_q, block.label ?? typeLabel, [
      { text: t.cancel, style: 'cancel' },
      { text: t.delete, style: 'destructive', onPress: onDelete },
    ])
  }

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onLongPress={confirmDelete}
      delayLongPress={400}
      onLayout={onLayoutY ? (e) => onLayoutY(e.nativeEvent.layout.y) : undefined}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: spacing[2],
        paddingVertical: spacing[3], paddingHorizontal: spacing[2], marginHorizontal: -spacing[2],
        borderRadius: radius.md, backgroundColor: isActive ? `${color}14` : 'transparent',
      }}
    >
      <View style={{ width: TIME_COL, opacity: faded ? 0.5 : 1 }}>
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: isActive ? color : colors.textPrimary, fontVariant: ['tabular-nums'] }}>
          {block.start_time.slice(0, 5)}
        </Text>
        <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, fontVariant: ['tabular-nums'] }}>{block.end_time.slice(0, 5)}</Text>
      </View>
      <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: color, opacity: faded ? 0.35 : 1 }} />
      <View style={{ flex: 1, paddingLeft: spacing[1], opacity: faded ? 0.5 : 1 }}>
        <Text
          style={{ fontSize: fontSize.base, fontWeight: isActive ? fontWeight.bold : fontWeight.semibold, color: colors.textPrimary, textDecorationLine: isDone ? 'line-through' : 'none' }}
          numberOfLines={1}
        >
          {block.label ?? typeLabel}
        </Text>
        <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>
          {meta.join(' · ')}
          {status ? <Text style={{ fontWeight: fontWeight.semibold, color: isActive ? color : colors.textSecondary }}>{`  ${status}`}</Text> : null}
        </Text>
      </View>
      <TaskCheckbox done={isDone} onToggle={onToggleDone} />
    </TouchableOpacity>
  )
}

function EventRow({ event }: { event: LocalCalendarEvent }) {
  const { colors } = useTheme()
  const time = (iso: string) => new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingVertical: spacing[3] }}>
      <View style={{ width: TIME_COL }}>
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textMuted, fontVariant: ['tabular-nums'] }}>
          {event.isAllDay ? 'Tüm gün' : time(event.startsAt)}
        </Text>
        {!event.isAllDay && <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, fontVariant: ['tabular-nums'] }}>{time(event.endsAt)}</Text>}
      </View>
      <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: colors.border }} />
      <View style={{ flex: 1, paddingLeft: spacing[1] }}>
        <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.textSecondary }} numberOfLines={1}>{event.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
          <Ionicons name="calendar-outline" size={11} color={colors.textSubtle} />
          <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>Takvim</Text>
        </View>
      </View>
    </View>
  )
}
