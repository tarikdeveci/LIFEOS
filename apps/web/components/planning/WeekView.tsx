'use client'

import { useState, useEffect, useCallback } from 'react'
import type { TimeBlock, DailyPlan } from '@lifeos/shared'
import { BLOCK_TYPE_COLORS, BLOCK_TYPE_LABELS, todayDate, shiftIsoDate } from '@lifeos/shared'
import { getBlocksForDateRange, getPlansForDateRange } from '@lifeos/shared/supabase'
import { supabase } from '@/lib/supabase/client'

// Grid sabitleri
const HOUR_START = 6          // 06:00
const HOUR_END   = 23         // 23:00
const TOTAL_HOURS = HOUR_END - HOUR_START  // 17 saat
const PX_PER_HOUR = 64        // Her saat kaç px

const ENERGY_EMOJI: Record<number, string> = { 1: '😴', 2: '😐', 3: '🙂', 4: '😊', 5: '🔥' }
const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr)
  const dow = d.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  return localDateStr(d)
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number) as [number, number]
  return h * 60 + m
}

function minutesToPx(minutes: number): number {
  return ((minutes - HOUR_START * 60) / 60) * PX_PER_HOUR
}

interface WeekViewProps {
  userId: string
  initialDate?: string
  onDayClick: (date: string) => void
}

export function WeekView({ userId, initialDate, onDayClick }: WeekViewProps) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(initialDate ?? todayDate()))
  const [blocks, setBlocks] = useState<TimeBlock[]>([])
  const [plans, setPlans] = useState<DailyPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [tooltip, setTooltip] = useState<{ block: TimeBlock; x: number; y: number } | null>(null)

  const weekEnd = shiftIsoDate(weekStart, 6)
  const today = todayDate()

  // 7 gün listesi (Pzt-Paz)
  const weekDays = Array.from({ length: 7 }, (_, i) => shiftIsoDate(weekStart, i))

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [b, p] = await Promise.all([
        getBlocksForDateRange(supabase, userId, weekStart, weekEnd),
        getPlansForDateRange(supabase, userId, weekStart, weekEnd),
      ])
      setBlocks(b)
      setPlans(p)
    } finally {
      setLoading(false)
    }
  }, [userId, weekStart, weekEnd])

  useEffect(() => { void fetchData() }, [fetchData])

  const prevWeek = () => setWeekStart((s) => shiftIsoDate(s, -7))
  const nextWeek = () => setWeekStart((s) => shiftIsoDate(s, 7))
  const goToday  = () => setWeekStart(getWeekStart(today))

  // Saat ekseni etiketleri
  const hourLabels = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => HOUR_START + i)

  // Haftalık özet
  const totalBlockedMinutes = weekDays.map((day) => {
    const dayBlocks = blocks.filter((b) => b.date === day)
    return dayBlocks.reduce((sum, b) => {
      return sum + (timeToMinutes(b.end_time) - timeToMinutes(b.start_time))
    }, 0)
  })

  const weekLabel = (() => {
    const start = new Date(weekStart)
    const end = new Date(weekEnd)
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }
    if (start.getMonth() === end.getMonth()) {
      return `${start.getDate()}–${end.toLocaleDateString('tr-TR', opts)}`
    }
    return `${start.toLocaleDateString('tr-TR', opts)} – ${end.toLocaleDateString('tr-TR', opts)}`
  })()

  return (
    <div className="glass flex flex-col gap-0 rounded-2xl overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={prevWeek} className="rounded-lg p-1.5 text-muted hover:bg-gray-100 text-lg">‹</button>
          <div>
            <h2 className="text-sm font-bold text-primary">{weekLabel}</h2>
            <p className="text-[10px] text-muted">
              {blocks.length} blok · {Math.round(totalBlockedMinutes.reduce((a, b) => a + b, 0) / 60)} saat planlandı
            </p>
          </div>
          <button onClick={nextWeek} className="rounded-lg p-1.5 text-muted hover:bg-gray-100 text-lg">›</button>
        </div>
        <button
          onClick={goToday}
          className="rounded-lg bg-accent/10 px-3 py-1 text-xs font-medium text-accent hover:bg-accent/20"
        >
          Bu Hafta
        </button>
      </div>

      {/* ── Gün başlıkları ── */}
      <div className="flex border-b border-gray-100">
        <div className="w-12 shrink-0" /> {/* Saat ekseni boşluğu */}
        {weekDays.map((day, i) => {
          const isToday = day === today
          const plan = plans.find((p) => p.date === day)
          const dayDate = new Date(day)
          const plannedH = Math.round(totalBlockedMinutes[i]! / 60)

          return (
            <button
              key={day}
              onClick={() => onDayClick(day)}
              className={`flex-1 border-l border-gray-50 py-2 text-center transition-colors hover:bg-gray-50 ${isToday ? 'bg-accent/5' : ''}`}
            >
              <p className={`text-[10px] font-medium uppercase tracking-wide ${isToday ? 'text-accent' : 'text-muted'}`}>
                {DAY_LABELS[i]}
              </p>
              <p className={`text-lg font-bold leading-tight ${isToday ? 'text-accent' : 'text-primary'}`}>
                {dayDate.getDate()}
              </p>
              <div className="flex items-center justify-center gap-1 mt-0.5">
                {plan?.energy_level && (
                  <span className="text-[10px]">{ENERGY_EMOJI[plan.energy_level]}</span>
                )}
                {plannedH > 0 && (
                  <span className="text-[9px] text-muted">{plannedH}s</span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Zaman Grid ── */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : (
        <div
          className="relative flex overflow-y-auto"
          style={{ maxHeight: '600px' }}
          onClick={() => setTooltip(null)}
        >
          {/* Saat ekseni */}
          <div className="w-12 shrink-0 relative" style={{ height: TOTAL_HOURS * PX_PER_HOUR }}>
            {hourLabels.map((h) => (
              <div
                key={h}
                className="absolute right-2 text-[9px] text-muted"
                style={{ top: (h - HOUR_START) * PX_PER_HOUR - 6 }}
              >
                {h < 10 ? `0${h}` : h}:00
              </div>
            ))}
          </div>

          {/* Gün sütunları */}
          {weekDays.map((day, di) => {
            const isToday = day === today
            const dayBlocks = blocks.filter((b) => b.date === day)

            return (
              <div
                key={day}
                className={`relative flex-1 border-l border-gray-50 cursor-pointer ${isToday ? 'bg-accent/[0.02]' : ''}`}
                style={{ height: TOTAL_HOURS * PX_PER_HOUR }}
                onClick={() => onDayClick(day)}
              >
                {/* Yatay çizgiler (her saat) */}
                {hourLabels.map((h) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-gray-50"
                    style={{ top: (h - HOUR_START) * PX_PER_HOUR }}
                  />
                ))}

                {/* Yarım saat çizgileri */}
                {hourLabels.slice(0, -1).map((h) => (
                  <div
                    key={`${h}-half`}
                    className="absolute left-0 right-0 border-t border-dashed border-gray-50/60"
                    style={{ top: (h - HOUR_START) * PX_PER_HOUR + PX_PER_HOUR / 2 }}
                  />
                ))}

                {/* Şu anki zaman çizgisi (bugün ise) */}
                {isToday && (() => {
                  const now = new Date()
                  const nowMinutes = now.getHours() * 60 + now.getMinutes()
                  const top = minutesToPx(nowMinutes)
                  if (top < 0 || top > TOTAL_HOURS * PX_PER_HOUR) return null
                  return (
                    <div
                      className="absolute left-0 right-0 z-20 flex items-center"
                      style={{ top }}
                    >
                      <div className="h-2 w-2 rounded-full bg-red-500 -ml-1" />
                      <div className="flex-1 border-t-2 border-red-400" />
                    </div>
                  )
                })()}

                {/* Bloklar */}
                {dayBlocks.map((block) => {
                  const startMin = timeToMinutes(block.start_time)
                  const endMin = timeToMinutes(block.end_time)
                  const topPx = minutesToPx(startMin)
                  const heightPx = Math.max(((endMin - startMin) / 60) * PX_PER_HOUR, 18)
                  const color = block.color ?? BLOCK_TYPE_COLORS[block.block_type]

                  if (topPx < 0) return null

                  return (
                    <div
                      key={block.id}
                      className="absolute left-0.5 right-0.5 rounded overflow-hidden cursor-pointer z-10 transition-opacity hover:opacity-90"
                      style={{
                        top: topPx + 1,
                        height: heightPx - 2,
                        backgroundColor: color + '22',
                        borderLeft: `3px solid ${color}`,
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setTooltip({ block, x: e.clientX, y: e.clientY })
                      }}
                    >
                      <div className="px-1 py-0.5">
                        <p
                          className="text-[9px] font-semibold leading-tight truncate"
                          style={{ color }}
                        >
                          {block.label ?? BLOCK_TYPE_LABELS[block.block_type]}
                        </p>
                        {heightPx > 28 && (
                          <p className="text-[8px] text-muted/80 leading-tight">
                            {block.start_time.slice(0, 5)}–{block.end_time.slice(0, 5)}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Tooltip ── */}
      {tooltip && (
        <div
          className="fixed z-50 rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-lg text-xs pointer-events-none"
          style={{ left: Math.min(tooltip.x + 12, window.innerWidth - 200), top: tooltip.y - 10 }}
        >
          <p className="font-semibold text-primary">{tooltip.block.label ?? BLOCK_TYPE_LABELS[tooltip.block.block_type]}</p>
          <p className="text-muted">{tooltip.block.start_time.slice(0,5)} – {tooltip.block.end_time.slice(0,5)}</p>
          <p className="text-muted">{BLOCK_TYPE_LABELS[tooltip.block.block_type]}</p>
        </div>
      )}

      {/* ── Alt özet şeridi ── */}
      <div className="flex border-t border-gray-100">
        <div className="w-12 shrink-0" />
        {weekDays.map((day, i) => {
          const dayBlocks = blocks.filter((b) => b.date === day)
          const types = [...new Set(dayBlocks.map((b) => b.block_type))]
          return (
            <div key={day} className="flex-1 border-l border-gray-50 py-1.5 px-1">
              <div className="flex flex-wrap gap-0.5 justify-center">
                {types.map((t) => (
                  <div
                    key={t}
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: BLOCK_TYPE_COLORS[t] }}
                    title={BLOCK_TYPE_LABELS[t]}
                  />
                ))}
              </div>
              <p className="text-center text-[9px] text-muted mt-0.5">
                {dayBlocks.length > 0 ? `${dayBlocks.length} blok` : '—'}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
