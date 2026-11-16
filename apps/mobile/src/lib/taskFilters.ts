import type { Task } from '@lifeos/shared'

export type TaskFilter = 'today' | 'week' | 'overdue' | 'unscheduled' | 'all'
export type TaskSort = 'priority' | 'due' | 'created'

export function filterTasks(
  tasks: Task[],
  filter: TaskFilter,
  todayStr: string,
  weekDays: string[]
): Task[] {
  if (filter === 'today') {
    return tasks.filter((t) => t.scheduled_date === todayStr)
  }
  if (filter === 'week') {
    return tasks.filter((t) => t.scheduled_date != null && weekDays.includes(t.scheduled_date))
  }
  if (filter === 'overdue') {
    return tasks.filter((t) => {
      if (t.status === 'done') return false
      const due = t.due_date
      const sched = t.scheduled_date
      return (due && due < todayStr) || (sched && sched < todayStr)
    })
  }
  if (filter === 'unscheduled') {
    return tasks.filter((t) => !t.scheduled_date && !t.due_date)
  }
  // 'all' means no additional date filtering
  return tasks
}

export function sortTasks(tasks: Task[], sort: TaskSort): Task[] {
  const list = [...tasks]
  if (sort === 'priority') {
    list.sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0))
  } else if (sort === 'due') {
    list.sort((a, b) => {
      const aDate = a.due_date || a.scheduled_date
      const bDate = b.due_date || b.scheduled_date
      if (!aDate && !bDate) return 0
      if (!aDate) return 1
      if (!bDate) return -1
      return aDate.localeCompare(bDate)
    })
  } else if (sort === 'created') {
    list.sort((a, b) => {
      const aCreated = a.created_at ?? ''
      const bCreated = b.created_at ?? ''
      return bCreated.localeCompare(aCreated)
    })
  }
  return list
}
