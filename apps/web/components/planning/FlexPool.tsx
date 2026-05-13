'use client'

import type { Task, TaskStatus } from '@lifeos/shared'
import { wsjfToPriorityLabel } from '@lifeos/shared'
import { useLang } from '@/lib/contexts/LangContext'

interface FlexPoolProps {
  tasks: Task[]
  dailyEffortLimit?: number
  onTaskClick?: (task: Task) => void
  onAssignToTimeline?: (task: Task) => void
  onMarkDone?: (taskId: string) => void
}

export function FlexPool({
  tasks,
  dailyEffortLimit = 25,
  onTaskClick,
  onAssignToTimeline,
  onMarkDone,
}: FlexPoolProps) {
  const { t } = useLang()
  const totalEffort = tasks.reduce((s, task) => s + task.effort_score, 0)
  const effortPct = Math.min((totalEffort / dailyEffortLimit) * 100, 100)
  const effortColor = effortPct > 100 ? 'bg-danger' : effortPct > 80 ? 'bg-warning' : 'bg-accent'

  const statusColor: Record<TaskStatus, string> = {
    backlog: 'text-muted',
    planned: 'text-accent',
    in_progress: 'text-warning',
    blocked: 'text-danger',
    done: 'text-success',
    deferred: 'text-muted',
  }

  return (
    <div className="space-y-3">
      {/* Efor göstergesi */}
      <div>
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-muted">{t.plan_flex_effort}</span>
          <span className="font-medium text-primary">{totalEffort}/{dailyEffortLimit}</span>
        </div>
        <div className="h-1.5 rounded-full bg-border/40">
          <div className={`h-1.5 rounded-full transition-all ${effortColor}`} style={{ width: `${Math.min(effortPct, 100)}%` }} />
        </div>
      </div>

      {tasks.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted">{t.plan_no_flex_tasks}</p>
      ) : (
        <div className="space-y-1.5">
          {tasks.map((task) => {
            const priorityLabel = wsjfToPriorityLabel(task.priority_score)
            const priorityEmoji = { critical: '🔥', high: '⬆️', medium: '➡️', low: '⬇️' }[priorityLabel]

            return (
              <div
                key={task.id}
                className="group flex items-center gap-2 rounded-xl border border-border/40 bg-surface/50 px-3 py-2 transition-all hover:border-accent/20 hover:bg-surface/80 hover:shadow-sm"
              >
                <span className="shrink-0 text-sm">{priorityEmoji}</span>

                <button
                  onClick={() => onTaskClick?.(task)}
                  className={`flex-1 truncate text-left text-xs font-medium ${statusColor[task.status]}`}
                >
                  {task.title}
                </button>

                {task.tags.length > 0 && (
                  <span className="shrink-0 rounded-md bg-accent/8 px-1.5 py-0.5 text-[10px] text-accent">
                    #{task.tags[0]}
                  </span>
                )}

                <span className="shrink-0 rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                  {task.effort_score}h
                </span>

                {onMarkDone && task.status !== 'done' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onMarkDone(task.id) }}
                    className="shrink-0 rounded-lg p-1 text-muted opacity-0 transition-all hover:bg-success/10 hover:text-success group-hover:opacity-100"
                    title={t.plan_mark_done}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                )}
                {task.status === 'done' && (
                  <span className="shrink-0 text-[10px] font-bold text-success">✓</span>
                )}

                {onAssignToTimeline && task.status !== 'done' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onAssignToTimeline(task) }}
                    className="shrink-0 rounded-lg p-1 text-muted opacity-0 transition-all hover:bg-accent/10 hover:text-accent group-hover:opacity-100"
                    title={t.plan_add_block}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
                    </svg>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
