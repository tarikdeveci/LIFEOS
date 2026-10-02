'use client'

import { useSyncExternalStore } from 'react'
import type { TimeBlock, Task } from '@lifeos/shared'
import { dayCapacity, formatDuration, minutesOfDay } from '@lifeos/shared'
import { useLang } from '@/lib/contexts/LangContext'

/** Şimdiki dakika, yarım dakikada bir yenilenir. Sunucu render'ında (0) tarayıcı saati okunmaz: hydration uyuşmazlığı olmasın. */
const subscribeClock = (onTick: () => void) => {
  const id = window.setInterval(onTick, 30_000)
  return () => window.clearInterval(id)
}
const currentMinute = () => minutesOfDay()
const serverMinute = () => 0

interface CapacityBarProps {
  /** Güne atanmış, henüz bloğa konmamış görevler. */
  tasks: Task[]
  timeBlocks: TimeBlock[]
  isToday: boolean
  /** Google dolu aralıkları: kapasiteden düşülür. */
  busy?: { start: number; end: number }[]
}

/**
 * Kapasite: bugünkü görevlerin süresi / çalışma saatlerinde kalan boşluk.
 * Bugün için geçmiş saatler sayılmaz. Aşımda kırmızı yerine nötr bir uyarı.
 */
export function CapacityBar({ tasks, timeBlocks, isToday, busy = [] }: CapacityBarProps) {
  const { t, lang } = useLang()
  const now = useSyncExternalStore(subscribeClock, currentMinute, serverMinute)
  const cap = dayCapacity(tasks, timeBlocks, isToday ? { from: now, busy } : { busy })
  const pct = Math.min(100, Math.round((Number.isFinite(cap.ratio) ? cap.ratio : 1) * 100))
  const summary = t.cap_summary
    .replace('{planned}', formatDuration(cap.plannedMinutes, lang))
    .replace('{free}', formatDuration(cap.availableMinutes, lang))

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-primary">{t.cap_title}</span>
        <span className="text-xs text-muted">{summary}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-border/40">
        <div className={`h-2 rounded-full transition-all ${cap.overloaded ? 'bg-warning' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-[10px] text-muted">{cap.overloaded ? t.cap_over : t.cap_free_hint}</p>
    </div>
  )
}
