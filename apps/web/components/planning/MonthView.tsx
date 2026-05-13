'use client'

import { useState, useEffect, useCallback } from 'react'
import type { TimeBlock, DailyPlan } from '@lifeos/shared'
import { BLOCK_TYPE_COLORS, todayDate } from '@lifeos/shared'
import {
  getBlocksForDateRange,
  getPlansForDateRange,
  getTaskCountsForDateRange,
} from '@lifeos/shared/supabase'
import { supabase } from '@/lib/supabase/client'

const ENERGY_EMOJI: Record<number, string> = { 1: '😴', 2: '😐', 3: '🙂', 4: '😊', 5: '🔥' }
const MONTH_NAMES = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
const DAY_LABELS = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz']

function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getMonthRange(year: number, month: number): { start: string; end: string } {
  return {
    start: localDateStr(new Date(year, month, 1)),
    end: localDateStr(new Date(year, month + 1, 0)),
  }
}

function getCalendarDays(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // Pazartesi başlangıçlı: Pzt=0 ... Paz=6
  let startDow = firstDay.getDay() - 1  // JS: 0=Pazar → dönüştür
  if (startDow < 0) startDow = 6         // Pazar → 6

  const cells: (Date | null)[] = []
  // Önceki ayın günleri (boş)
  for (let i = 0; i < startDow; i++) cells.push(null)
  // Bu ayın günleri
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d))
  // Sonraki ayın günleri (6'nın katına tamamla)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

interface TaskCount { date: string; total: number; done: number }

interface MonthViewProps {
  userId: string
  initialDate?: string
  onDayClick: (date: string) => void
}

export function MonthView({ userId, initialDate, onDayClick }: MonthViewProps) {
  const initial = new Date(initialDate ?? todayDate())
  const [year, setYear] = useState(initial.getFullYear())
  const [month, setMonth] = useState(initial.getMonth())
  const [blocks, setBlocks] = useState<TimeBlock[]>([])
  const [plans, setPlans] = useState<DailyPlan[]>([])
  const [taskCounts, setTaskCounts] = useState<TaskCount[]>([])
  const [loading, setLoading] = useState(true)

  const today = todayDate()

  const { start, end } = getMonthRange(year, month)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [b, p, t] = await Promise.all([
        getBlocksForDateRange(supabase, userId, start, end),
        getPlansForDateRange(supabase, userId, start, end),
        getTaskCountsForDateRange(supabase, userId, start, end),
      ])
      setBlocks(b)
      setPlans(p)
      setTaskCounts(t)
    } finally {
      setLoading(false)
    }
  }, [userId, start, end])

  useEffect(() => { void fetchData() }, [fetchData])

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1) }
    else setMonth((m) => m - 1)
  }
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1) }
    else setMonth((m) => m + 1)
  }
  const goToday = () => {
    const now = new Date()
    setYear(now.getFullYear())
    setMonth(now.getMonth())
  }

  const days = getCalendarDays(year, month)

  // Haftaları hesapla (haftalık stat için)
  const totalBlocksMonth = blocks.length
  const totalDaysWithBlocks = new Set(blocks.map((b) => b.date)).size
  const totalTasksMonth = taskCounts.reduce((s, t) => s + t.total, 0)
  const doneTasksMonth = taskCounts.reduce((s, t) => s + t.done, 0)

  return (
    <div className="glass flex flex-col rounded-2xl overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="rounded-lg p-1.5 text-muted hover:bg-gray-100 text-lg">‹</button>
          <div>
            <h2 className="text-sm font-bold text-primary">{MONTH_NAMES[month]} {year}</h2>
            <p className="text-[10px] text-muted">
              {totalBlocksMonth} blok · {totalDaysWithBlocks} aktif gün
            </p>
          </div>
          <button onClick={nextMonth} className="rounded-lg p-1.5 text-muted hover:bg-gray-100 text-lg">›</button>
        </div>
        <div className="flex items-center gap-3">
          {/* Özet stat */}
          <div className="hidden sm:flex gap-3 text-xs text-muted">
            <span>
              Görev: <strong className="text-primary">{doneTasksMonth}/{totalTasksMonth}</strong>
            </span>
          </div>
          <button
            onClick={goToday}
            className="rounded-lg bg-accent/10 px-3 py-1 text-xs font-medium text-accent hover:bg-accent/20"
          >
            Bu Ay
          </button>
        </div>
      </div>

      {/* ── Gün başlıkları ── */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {DAY_LABELS.map((d) => (
          <div key={d} className="py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-muted">
            {d}
          </div>
        ))}
      </div>

      {/* ── Takvim ızgarası ── */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : (
        <div className="grid grid-cols-7 divide-x divide-y divide-gray-50">
          {days.map((day, idx) => {
            if (!day) {
              return <div key={`empty-${idx}`} className="h-24 bg-gray-50/50" />
            }

            const dateStr = localDateStr(day)
            const isToday = dateStr === today
            const isCurrentMonth = day.getMonth() === month
            const dayBlocks = blocks.filter((b) => b.date === dateStr)
            const plan = plans.find((p) => p.date === dateStr)
            const taskCount = taskCounts.find((t) => t.date === dateStr)

            // Blok tiplerini unique olarak al (en fazla 4 nokta)
            const blockTypeDots = [...new Set(dayBlocks.map((b) => b.block_type))].slice(0, 5)

            // Yoğunluk: kaç saat planlandı
            const plannedMinutes = dayBlocks.reduce((sum, b) => {
              const [sh, sm] = b.start_time.split(':').map(Number) as [number, number]
              const [eh, em] = b.end_time.split(':').map(Number) as [number, number]
              return sum + (eh * 60 + em) - (sh * 60 + sm)
            }, 0)
            const plannedHours = Math.round(plannedMinutes / 60)

            // Görev tamamlama rengi
            const taskCompletion = taskCount
              ? taskCount.total > 0 ? taskCount.done / taskCount.total : null
              : null

            return (
              <button
                key={dateStr}
                onClick={() => onDayClick(dateStr)}
                className={`relative h-24 p-1.5 text-left transition-colors group ${
                  isToday
                    ? 'bg-accent/5 hover:bg-accent/10'
                    : isCurrentMonth
                      ? 'bg-white hover:bg-gray-50'
                      : 'bg-gray-50/30 hover:bg-gray-50'
                }`}
              >
                {/* Gün numarası */}
                <div className="flex items-start justify-between">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                      isToday
                        ? 'bg-accent text-white'
                        : isCurrentMonth
                          ? 'text-primary group-hover:bg-accent/10'
                          : 'text-muted/50'
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  <div className="flex items-center gap-0.5">
                    {plan?.energy_level && (
                      <span className="text-[10px]">{ENERGY_EMOJI[plan.energy_level]}</span>
                    )}
                    {plannedHours > 0 && (
                      <span className="text-[9px] text-muted">{plannedHours}s</span>
                    )}
                  </div>
                </div>

                {/* Blok tipi noktaları */}
                {blockTypeDots.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-0.5">
                    {blockTypeDots.map((type) => (
                      <div
                        key={type}
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: BLOCK_TYPE_COLORS[type] }}
                        title={type}
                      />
                    ))}
                    {blockTypeDots.length < new Set(dayBlocks.map((b) => b.block_type)).size && (
                      <div className="h-2 w-2 rounded-full bg-gray-300" title="Daha fazla" />
                    )}
                  </div>
                )}

                {/* İlk 2 blok preview */}
                <div className="mt-1 space-y-0.5">
                  {dayBlocks.slice(0, 2).map((b) => (
                    <div
                      key={b.id}
                      className="truncate rounded px-1 text-[9px] font-medium leading-tight"
                      style={{
                        backgroundColor: (b.color ?? BLOCK_TYPE_COLORS[b.block_type]) + '18',
                        color: b.color ?? BLOCK_TYPE_COLORS[b.block_type],
                      }}
                    >
                      {b.start_time.slice(0, 5)} {b.label ?? b.block_type}
                    </div>
                  ))}
                  {dayBlocks.length > 2 && (
                    <p className="text-[9px] text-muted pl-1">+{dayBlocks.length - 2} daha</p>
                  )}
                </div>

                {/* Görev tamamlama bar'ı (alt) */}
                {taskCompletion !== null && taskCount && taskCount.total > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-100">
                    <div
                      className="h-full bg-success transition-all"
                      style={{ width: `${taskCompletion * 100}%` }}
                    />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Legend ── */}
      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 px-4 py-2">
        {[
          { type: 'focus',   label: 'Odak' },
          { type: 'routine', label: 'Rutin' },
          { type: 'meal',    label: 'Öğün' },
          { type: 'workout', label: 'Spor' },
          { type: 'break',   label: 'Mola' },
          { type: 'task',    label: 'Görev' },
        ].map(({ type, label }) => (
          <div key={type} className="flex items-center gap-1">
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: BLOCK_TYPE_COLORS[type as keyof typeof BLOCK_TYPE_COLORS] }}
            />
            <span className="text-[10px] text-muted">{label}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <div className="h-1 w-8 rounded bg-success" />
          <span className="text-[10px] text-muted">Görev tamamlama</span>
        </div>
      </div>
    </div>
  )
}
