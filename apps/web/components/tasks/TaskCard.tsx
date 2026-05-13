'use client'

import type { Task, TaskStatus } from '@lifeos/shared'
import { TASK_STATUS_COLORS, TASK_STATUS_LABELS, wsjfToPriorityLabel } from '@lifeos/shared'
import { Badge } from '@/components/ui/Badge'

interface TaskCardProps {
  task: Task
  onClick?: (task: Task) => void
  onStatusChange?: (taskId: string, status: TaskStatus) => void
  compact?: boolean
}

function PriorityIndicator({ score }: { score: number }) {
  const label = wsjfToPriorityLabel(score)
  const config = {
    critical: { color: 'bg-danger', label: 'Kritik' },
    high: { color: 'bg-warning', label: 'Yuksek' },
    medium: { color: 'bg-accent', label: 'Orta' },
    low: { color: 'bg-gray-300', label: 'Dusuk' },
  }[label]

  return (
    <span title={`Öncelik: ${score.toFixed(2)}`} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold text-white ${config.color}`}>
      {config.label}
    </span>
  )
}

function EffortBar({ effort }: { effort: number }) {
  return (
    <div className="flex gap-0.5" title={`Efor: ${effort}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={`h-1.5 w-2 rounded-full ${i <= effort ? 'bg-purple-400' : 'bg-gray-200'}`}
        />
      ))}
    </div>
  )
}

export function TaskCard({ task, onClick, onStatusChange, compact = false }: TaskCardProps) {
  const statusColors = TASK_STATUS_COLORS[task.status]
  const isPastDue = task.due_date && task.due_date < new Date().toISOString().split('T')[0]!
  const isDone = task.status === 'done'

  function handleCheckbox(e: React.MouseEvent) {
    e.stopPropagation()
    if (onStatusChange) {
      onStatusChange(task.id, isDone ? 'planned' : 'done')
    }
  }

  return (
    <div
      onClick={() => onClick?.(task)}
      className={`group rounded-xl border border-gray-100 bg-white p-3 transition-all duration-150 ${
        onClick ? 'cursor-pointer hover:border-accent/30 hover:shadow-md' : ''
      } ${isDone ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          onClick={handleCheckbox}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
            isDone
              ? 'border-success bg-success text-white'
              : 'border-gray-300 hover:border-accent'
          }`}
        >
          {isDone && (
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <PriorityIndicator score={task.priority_score} />
            <h3 className={`text-sm font-medium ${isDone ? 'line-through text-muted' : 'text-primary'}`}>
              {task.title}
            </h3>
          </div>

          {!compact && task.description && (
            <p className="mt-1 line-clamp-1 text-xs text-muted">{task.description}</p>
          )}

          {/* Meta row */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge color={statusColors}>{TASK_STATUS_LABELS[task.status]}</Badge>

            <EffortBar effort={task.effort_score} />

            {task.estimated_minutes && (
              <span className="text-xs text-muted">Sure: {task.estimated_minutes} dk</span>
            )}

            {task.due_date && (
              <span className={`text-xs ${isPastDue ? 'font-medium text-danger' : 'text-muted'}`}>
                Son tarih: {task.due_date}
              </span>
            )}

            {/* Tags */}
            {task.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline">#{tag}</Badge>
            ))}
            {task.tags.length > 3 && (
              <span className="text-xs text-muted">+{task.tags.length - 3}</span>
            )}
          </div>
        </div>

        {/* Priority score */}
        <div className="shrink-0 text-right">
          <span className="text-xs font-semibold text-muted">{task.priority_score.toFixed(1)}</span>
        </div>
      </div>
    </div>
  )
}
