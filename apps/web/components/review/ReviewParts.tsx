'use client'

import Link from 'next/link'
import { BLOCK_TYPE_COLORS, type BlockType, type ReviewDay, type ReviewTask } from '@lifeos/shared'

interface MetricCardProps {
  label: string
  value: string
  detail?: string
  /** Geçen haftaya göre fark; pozitif iyi. null: karşılaştırma yok */
  delta: number | null
  deltaLabel: string
}

export function MetricCard({ label, value, detail, delta, deltaLabel }: MetricCardProps) {
  const tone = delta == null || delta === 0 ? 'text-muted' : delta > 0 ? 'text-emerald-600' : 'text-rose-500'
  const arrow = delta == null || delta === 0 ? '' : delta > 0 ? '▲ ' : '▼ '
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-primary">{value}</p>
      {detail && <p className="text-xs text-muted">{detail}</p>}
      <p className={`mt-2 text-[11px] font-medium ${tone}`}>{arrow}{deltaLabel}</p>
    </div>
  )
}

interface DayBarsProps {
  days: ReviewDay[]
  dayName: (date: string) => string
  plannedLabel: string
  completedLabel: string
  tasksLabel: string
}

/** Gün başına planlanan ve tamamlanan blok süresi; altında biten görev sayısı. */
export function DayBars({ days, dayName, plannedLabel, completedLabel, tasksLabel }: DayBarsProps) {
  const max = Math.max(60, ...days.map((day) => day.plannedMinutes))
  return (
    <div className="space-y-3">
      <div className="flex h-40 items-end gap-3">
        {days.map((day) => (
          <div key={day.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1"
            title={`${plannedLabel}: ${day.plannedMinutes} · ${completedLabel}: ${day.completedMinutes}`}>
            <div className="relative w-full max-w-[36px] flex-1">
              <div className="absolute bottom-0 w-full rounded-t-md bg-border/60" style={{ height: `${(day.plannedMinutes / max) * 100}%` }} />
              <div className="absolute bottom-0 w-full rounded-t-md bg-accent" style={{ height: `${(day.completedMinutes / max) * 100}%` }} />
            </div>
            <span className="text-[11px] font-medium text-muted">{dayName(day.date)}</span>
            <span className="text-[10px] text-muted">{day.tasksCompleted} {tasksLabel}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-border/60" />{plannedLabel}</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-accent" />{completedLabel}</span>
      </div>
    </div>
  )
}

interface TypeBreakdownProps {
  entries: Array<{ type: BlockType; planned: number; completed: number }>
  typeName: (type: BlockType) => string
  formatMinutes: (minutes: number) => string
}

export function TypeBreakdown({ entries, typeName, formatMinutes }: TypeBreakdownProps) {
  const total = entries.reduce((sum, entry) => sum + entry.planned, 0)
  return (
    <ul className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.type} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-primary">{typeName(entry.type)}</span>
            <span className="text-muted">{formatMinutes(entry.completed)} / {formatMinutes(entry.planned)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-border/40">
            <div className="h-full rounded-full" style={{
              width: `${total > 0 ? (entry.planned / total) * 100 : 0}%`,
              backgroundColor: BLOCK_TYPE_COLORS[entry.type],
              opacity: entry.planned > 0 ? 0.35 + 0.65 * (entry.completed / entry.planned) : 1,
            }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

interface TaskListProps {
  tasks: ReviewTask[]
  empty: string
  limit: number
  moreLabel: (count: number) => string
  meta?: (task: ReviewTask) => string | null
}

/** Görevler komut paletiyle aynı yoldan açılır: /tasks?task=<id> */
export function TaskList({ tasks, empty, limit, moreLabel, meta }: TaskListProps) {
  if (tasks.length === 0) return <p className="text-sm text-muted">{empty}</p>
  return (
    <ul className="space-y-1">
      {tasks.slice(0, limit).map((task) => (
        <li key={task.id}>
          <Link href={`/tasks?task=${task.id}`}
            className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm text-primary hover:bg-border/30">
            <span className="truncate">{task.title}</span>
            {meta?.(task) && <span className="shrink-0 text-xs text-muted">{meta(task)}</span>}
          </Link>
        </li>
      ))}
      {tasks.length > limit && <li className="px-2 pt-1 text-xs text-muted">{moreLabel(tasks.length - limit)}</li>}
    </ul>
  )
}
