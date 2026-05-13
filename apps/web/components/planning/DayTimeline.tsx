'use client'

import { useMemo, useRef, useState, useCallback } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import type { TimeBlock } from '@lifeos/shared'
import {
  BLOCK_TYPE_COLORS,
  BLOCK_TYPE_LABELS,
  minutesBetween,
  parseClockParts,
  APP_DEFAULTS,
} from '@lifeos/shared'

interface DayTimelineProps {
  timeBlocks: TimeBlock[]
  startHour?: number
  endHour?: number
  hourHeight?: number
  onBlockClick?: (block: TimeBlock) => void
  onSlotClick?: (time: string) => void
  onBlockDrop?: (blockId: string, newStartTime: string, newEndTime: string) => void
}

/** Dakikayı "HH:MM" stringe çevirir (0-1439 arası) */
function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** "HH:MM" → toplam dakika */
function timeToMinutes(time: string): number {
  const { h, m } = parseClockParts(time)
  return h * 60 + m
}

/** En yakın 15 dakikaya yuvarla */
function snapTo15(minutes: number): number {
  return Math.round(minutes / 15) * 15
}

// ---------- Draggable Block ----------
interface DraggableBlockProps {
  block: TimeBlock
  top: number
  height: number
  isDragging: boolean
  onClick?: (block: TimeBlock) => void
}

function DraggableBlock({ block, top, height, isDragging, onClick }: DraggableBlockProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: block.id })
  const color = block.color ?? BLOCK_TYPE_COLORS[block.block_type]
  const label = block.label ?? BLOCK_TYPE_LABELS[block.block_type]
  const duration = minutesBetween(block.start_time, block.end_time)

  const style: React.CSSProperties = {
    position: 'absolute',
    top,
    height: Math.max(height, 24),
    left: '2.75rem',   // left-11
    right: '0.5rem',   // right-2
    zIndex: isDragging ? 50 : 10,
    opacity: isDragging ? 0.4 : 1,
    transform: transform ? `translate(0px, ${transform.y}px)` : undefined,
    borderLeftColor: color,
    backgroundColor: `${color}15`,
    cursor: 'grab',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="overflow-hidden rounded-lg border-l-4 px-3 py-1.5 text-left shadow-sm transition-shadow hover:shadow-md"
      {...listeners}
      {...attributes}
      onClick={(e) => {
        // Drag olmadıysa onClick tetikle
        if (!transform) {
          e.stopPropagation()
          onClick?.(block)
        }
      }}
    >
      <p className="truncate text-xs font-semibold" style={{ color }}>
        {label}
      </p>
      {height > 36 && (
        <p className="text-[10px] text-muted">
          {block.start_time.slice(0, 5)}–{block.end_time.slice(0, 5)} ({duration}dk)
        </p>
      )}
    </div>
  )
}

// ---------- Overlay (sürüklenen klon) ----------
function BlockOverlay({ block, height }: { block: TimeBlock; height: number }) {
  const color = block.color ?? BLOCK_TYPE_COLORS[block.block_type]
  const label = block.label ?? BLOCK_TYPE_LABELS[block.block_type]
  return (
    <div
      style={{
        width: 'max(200px, 60%)',
        height: Math.max(height, 24),
        borderLeftColor: color,
        backgroundColor: `${color}25`,
        opacity: 0.9,
      }}
      className="overflow-hidden rounded-lg border-l-4 px-3 py-1.5 shadow-xl"
    >
      <p className="truncate text-xs font-semibold" style={{ color }}>{label}</p>
    </div>
  )
}

// ---------- Ana bileşen ----------
export function DayTimeline({
  timeBlocks,
  startHour = APP_DEFAULTS.TIMELINE_START_HOUR,
  endHour = APP_DEFAULTS.TIMELINE_END_HOUR,
  hourHeight = APP_DEFAULTS.TIMELINE_HOUR_HEIGHT,
  onBlockClick,
  onSlotClick,
  onBlockDrop,
}: DayTimelineProps) {
  const hours = useMemo(
    () => Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
    [startHour, endHour],
  )
  const totalHeight = hours.length * hourHeight
  const timelineRef = useRef<HTMLDivElement>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  // Şu an çizgisi
  const now = new Date()
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()
  const nowOffset =
    currentHour >= startHour && currentHour < endHour
      ? (currentHour - startHour) * hourHeight + (currentMinute / 60) * hourHeight
      : null

  function getBlockPosition(block: TimeBlock) {
    const s = parseClockParts(block.start_time)
    const e = parseClockParts(block.end_time)
    const top = (s.h - startHour) * hourHeight + (s.m / 60) * hourHeight
    const bottom = (e.h - startHour) * hourHeight + (e.m / 60) * hourHeight
    return { top, height: Math.max(bottom - top, 24) }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDraggingId(String(event.active.id))
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDraggingId(null)
      const { active, delta } = event
      if (!onBlockDrop || Math.abs(delta.y) < 5) return

      const block = timeBlocks.find((b) => b.id === active.id)
      if (!block) return

      const startMin = timeToMinutes(block.start_time)
      const endMin = timeToMinutes(block.end_time)
      const durationMin = endMin - startMin

      // pixel → dakika
      const deltaMinutes = (delta.y / hourHeight) * 60
      const rawNewStart = startMin + deltaMinutes
      const snappedStart = Math.max(
        startHour * 60,
        Math.min(snapTo15(rawNewStart), endHour * 60 - durationMin),
      )
      const snappedEnd = snappedStart + durationMin

      // Değişmediyse callback çağırma
      if (snappedStart === startMin) return

      onBlockDrop(String(active.id), minutesToTime(snappedStart), minutesToTime(snappedEnd))
    },
    [timeBlocks, hourHeight, startHour, endHour, onBlockDrop],
  )

  const draggingBlock = draggingId ? timeBlocks.find((b) => b.id === draggingId) : null

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div ref={timelineRef} className="relative" style={{ height: totalHeight }}>
        {/* Saat çizgileri */}
        {hours.map((hour) => (
          <div
            key={hour}
            className="absolute left-0 right-0 border-t border-gray-100"
            style={{ top: (hour - startHour) * hourHeight }}
          >
            <span className="absolute -top-2.5 left-0 text-[10px] font-medium text-muted">
              {String(hour).padStart(2, '0')}:00
            </span>
            {/* Boş slot tıklama */}
            <button
              onClick={() => onSlotClick?.(`${String(hour).padStart(2, '0')}:00`)}
              className="absolute left-10 right-0 opacity-0 hover:bg-accent/5 hover:opacity-100"
              style={{ height: hourHeight }}
            />
          </div>
        ))}

        {/* Şu an çizgisi */}
        {nowOffset !== null && (
          <div
            className="absolute left-8 right-0 z-20 flex items-center"
            style={{ top: nowOffset }}
          >
            <div className="h-2.5 w-2.5 rounded-full bg-danger" />
            <div className="h-[2px] flex-1 bg-danger" />
          </div>
        )}

        {/* Zaman blokları */}
        {timeBlocks.map((block) => {
          const pos = getBlockPosition(block)
          return (
            <DraggableBlock
              key={block.id}
              block={block}
              top={pos.top}
              height={pos.height}
              isDragging={draggingId === block.id}
              onClick={onBlockClick}
            />
          )
        })}
      </div>

      {/* Sürükleme klon overlay */}
      <DragOverlay dropAnimation={null}>
        {draggingBlock ? (
          <BlockOverlay
            block={draggingBlock}
            height={getBlockPosition(draggingBlock).height}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
