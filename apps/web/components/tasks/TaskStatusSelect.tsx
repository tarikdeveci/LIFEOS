'use client'

import type { TaskStatus } from '@lifeos/shared'
import { TASK_STATUS_LABELS, TASK_STATUS_COLORS } from '@lifeos/shared'

interface TaskStatusSelectProps {
  value: TaskStatus
  onChange: (status: TaskStatus) => void
  disabled?: boolean
}

const ALL_STATUSES: TaskStatus[] = ['backlog', 'planned', 'in_progress', 'blocked', 'done', 'deferred']

export function TaskStatusSelect({ value, onChange, disabled }: TaskStatusSelectProps) {
  const current = TASK_STATUS_COLORS[value]

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as TaskStatus)}
        disabled={disabled}
        className={`appearance-none rounded-lg border px-3 py-1.5 pr-8 text-xs font-medium transition-colors ${current.bg} ${current.text} ${current.border} cursor-pointer outline-none`}
      >
        {ALL_STATUSES.map((status) => (
          <option key={status} value={status}>
            {TASK_STATUS_LABELS[status]}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-current"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  )
}
