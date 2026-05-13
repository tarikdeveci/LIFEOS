'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Task, TaskStatus, CreateTaskInput, UpdateTaskInput } from '@lifeos/shared'
import { TASK_STATUS_COLORS } from '@lifeos/shared'
import { useTaskStore } from '@lifeos/shared'
import { updateTaskDetails } from '@lifeos/shared/supabase'
import { supabase } from '@/lib/supabase/client'
import { TaskCard } from '@/components/tasks/TaskCard'
import { TaskDetailDrawer } from '@/components/tasks/TaskDetailDrawer'
import { QuickTaskInput } from '@/components/tasks/QuickTaskInput'
import { Badge } from '@/components/ui/Badge'
import { useLang } from '@/lib/contexts/LangContext'

type ViewTab = 'kanban' | 'list' | 'backlog'

const KANBAN_COLUMNS: TaskStatus[] = ['backlog', 'planned', 'in_progress', 'blocked', 'done']

export default function TasksClientPage({ userId }: { userId: string }) {
  const { t } = useLang()

  const [activeTab, setActiveTab] = useState<ViewTab>('list')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [hideRoutine, setHideRoutine]     = useState(true)
  const [hideDone, setHideDone]           = useState(true)

  const ROUTINE_TAGS = ['spor', 'yazılım', 'must-do', 'sağlık', 'kariyer']

  // Status labels derived from t so they update with locale
  const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
    backlog:     t.tasks_status_backlog,
    planned:     t.tasks_status_planned,
    in_progress: t.tasks_status_in_progress,
    blocked:     t.tasks_status_blocked,
    done:        t.tasks_status_done,
    deferred:    t.tasks_status_deferred,
  }

  const { tasks, loading, fetchTasks, fetchBacklog, addTask, updateTask, deleteTask, setStatus } =
    useTaskStore()

  // İlk yükleme
  useEffect(() => {
    void fetchTasks(supabase, userId)
  }, [fetchTasks, userId])

  const handleCreateTask = useCallback(
    async (input: CreateTaskInput) => {
      await addTask(supabase, userId, input)
    },
    [addTask, userId],
  )

  const handleUpdateTask = useCallback(
    async (taskId: string, updates: UpdateTaskInput) => {
      await updateTask(supabase, taskId, updates)
    },
    [updateTask],
  )

  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      await deleteTask(supabase, taskId)
    },
    [deleteTask],
  )

  const handleStatusChange = useCallback(
    async (taskId: string, status: TaskStatus) => {
      await setStatus(supabase, taskId, status)
    },
    [setStatus],
  )

  const openTaskDetail = useCallback((task: Task) => {
    setSelectedTask(task)
    setDrawerOpen(true)
  }, [])

  const handleTabChange = useCallback(
    (tab: ViewTab) => {
      setActiveTab(tab)
      if (tab === 'backlog') {
        void fetchBacklog(supabase, userId)
      } else {
        void fetchTasks(supabase, userId)
      }
    },
    [fetchTasks, fetchBacklog, userId],
  )

  const isRoutineTask = (task: Task) =>
    hideRoutine && (task.tags ?? []).some((tag) => ROUTINE_TAGS.includes(tag))

  // Kanban: status gruplarına ayır (rutinler + tamamlananlar hariç)
  const kanbanColumns = hideDone ? KANBAN_COLUMNS.filter((s) => s !== 'done' && s !== 'deferred') : KANBAN_COLUMNS
  const tasksByStatus = KANBAN_COLUMNS.reduce<Record<TaskStatus, Task[]>>(
    (acc, status) => {
      acc[status] = tasks.filter((task) => task.status === status && !isRoutineTask(task))
      return acc
    },
    {} as Record<TaskStatus, Task[]>,
  )

  // Filtreleme — liste ve backlog görünümlerinde aktif
  const allTags = Array.from(new Set(tasks.flatMap((task) => task.tags))).sort()
  const filteredTasks = tasks.filter((task) => {
    if (isRoutineTask(task)) return false
    if (hideDone && (task.status === 'done' || task.status === 'deferred')) return false
    if (statusFilter !== 'all' && task.status !== statusFilter) return false
    if (tagFilter && !task.tags.includes(tagFilter)) return false
    return true
  })

  const hiddenRoutineCount = tasks.filter(isRoutineTask).length
  const doneTasks = tasks.filter((task) => task.status === 'done' || task.status === 'deferred')

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-primary">{t.tasks_title}</h1>
          <span className="rounded-full bg-border/40 px-2.5 py-0.5 text-xs font-medium text-muted">
            {tasks.length}
          </span>
        </div>
        <QuickTaskInput onCreateTask={handleCreateTask} />
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl bg-border/40 p-1">
        {([
          { key: 'list' as const, label: t.tasks_tab_list },
          { key: 'kanban' as const, label: t.tasks_tab_kanban },
          { key: 'backlog' as const, label: t.tasks_tab_backlog },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-surface text-primary shadow-sm'
                : 'text-muted hover:text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filtreler — liste ve backlog görünümlerinde */}
      {(activeTab === 'list' || activeTab === 'backlog') && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Rutin gizle toggle */}
          <button
            onClick={() => setHideRoutine((h) => !h)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              hideRoutine
                ? 'border-accent/30 bg-accent/10 text-accent'
                : 'border-border bg-surface text-muted hover:border-border/60'
            }`}
          >
            {hideRoutine ? `${t.tasks_hide_routine} (${hiddenRoutineCount})` : t.tasks_show_routine}
          </button>

          {/* Tamamlananları gizle toggle */}
          <button
            onClick={() => setHideDone((h) => !h)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              hideDone
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-border bg-surface text-muted hover:border-border/60'
            }`}
          >
            {hideDone ? `${t.tasks_hide_done} (${doneTasks.length})` : t.tasks_show_done}
          </button>

          {/* Durum filtresi */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'all')}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-primary outline-none focus:border-accent"
          >
            <option value="all">{t.tasks_filter_all}</option>
            {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map((s) => (
              <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
            ))}
          </select>

          {/* Etiket filtresi */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tagFilter && (
                <button
                  onClick={() => setTagFilter(null)}
                  className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent"
                >
                  ✕ #{tagFilter}
                </button>
              )}
              {!tagFilter && allTags.slice(0, 8).map((tag) => (
                <button
                  key={tag}
                  onClick={() => setTagFilter(tag)}
                  className="rounded-full bg-border/40 px-2.5 py-1 text-xs text-muted hover:bg-border/60 hover:text-primary"
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}

          {(statusFilter !== 'all' || tagFilter) && (
            <button
              onClick={() => { setStatusFilter('all'); setTagFilter(null) }}
              className="text-xs text-muted hover:text-primary"
            >
              Filtreleri Temizle
            </button>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      )}

      {/* Liste görünümü */}
      {!loading && activeTab === 'list' && (
        <div className="space-y-2">
          {filteredTasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border py-16 text-center">
              <p className="text-lg text-muted">
                {tasks.length === 0 ? t.tasks_empty : 'Filtreye uygun görev yok'}
              </p>
              <p className="mt-1 text-sm text-muted/60">
                {tasks.length === 0
                  ? t.tasks_empty_hint
                  : 'Farklı filtre dene'}
              </p>
            </div>
          ) : (
            filteredTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onClick={openTaskDetail}
                onStatusChange={handleStatusChange}
              />
            ))
          )}
        </div>
      )}

      {/* Kanban görünümü */}
      {!loading && activeTab === 'kanban' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {kanbanColumns.map((status) => {
            const columnTasks = tasksByStatus[status] ?? []
            const statusColor = TASK_STATUS_COLORS[status]

            return (
              <div key={status} className="w-72 shrink-0">
                {/* Column Header */}
                <div className="mb-3 flex items-center gap-2">
                  <Badge color={statusColor}>{TASK_STATUS_LABELS[status]}</Badge>
                  <span className="text-xs text-muted">{columnTasks.length}</span>
                </div>

                {/* Column Body */}
                <div className="space-y-2 rounded-xl bg-background p-2">
                  {columnTasks.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted">
                      Boş
                    </div>
                  ) : (
                    columnTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onClick={openTaskDetail}
                        onStatusChange={handleStatusChange}
                        compact
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Backlog görünümü */}
      {!loading && activeTab === 'backlog' && (
        <div className="space-y-2">
          <p className="text-xs text-muted">
            Henüz tarihe planlanmamış görevler (öncelik sırasına göre)
          </p>
          {filteredTasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border py-16 text-center">
              <p className="text-lg text-muted">Backlog boş 🎉</p>
              <p className="mt-1 text-sm text-muted/60">Tüm görevlerin planlanmış</p>
            </div>
          ) : (
            filteredTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onClick={openTaskDetail}
                onStatusChange={handleStatusChange}
              />
            ))
          )}
        </div>
      )}

      {/* Task Detail Drawer */}
      <TaskDetailDrawer
        task={selectedTask}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false)
          setSelectedTask(null)
        }}
        onUpdate={handleUpdateTask}
        onDelete={handleDeleteTask}
        onStatusChange={handleStatusChange}
        onUpdateChecklist={async (taskId, checklist) => {
          await updateTaskDetails(supabase, taskId, { checklist })
          if (selectedTask?.id === taskId) {
            setSelectedTask({
              ...selectedTask,
              task_details: selectedTask.task_details
                ? { ...selectedTask.task_details, checklist }
                : undefined,
            })
          }
        }}
      />
    </div>
  )
}
