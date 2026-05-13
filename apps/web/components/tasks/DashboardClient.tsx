'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { Task, TaskStatus, CreateTaskInput, WeeklyDayStat } from '@lifeos/shared'
import {
  todayDate,
  relativeDateLabel,
  toDateString,
  weekStart,
  shiftIsoDate,
  useTaskStore,
  usePlanningStore,
  useNutritionStore,
  useWorkoutStore,
  BLOCK_TYPE_COLORS,
  BLOCK_TYPE_LABELS,
  WORKOUT_STATUS_LABELS,
  APP_DEFAULTS,
} from '@lifeos/shared'
import {
  updateTaskDetails,
  getWeeklyTaskStats,
  getWeeklyNutritionSummary,
  getWeeklyWorkoutStats,
} from '@lifeos/shared/supabase'
import { supabase } from '@/lib/supabase/client'
import { TaskCard } from '@/components/tasks/TaskCard'
import { TaskDetailDrawer } from '@/components/tasks/TaskDetailDrawer'
import { QuickTaskInput } from '@/components/tasks/QuickTaskInput'
import { WeeklyStatsChart } from '@/components/WeeklyStatsChart'
import { CalendarDays, CheckSquare, BarChart2, Dumbbell, Salad, TrendingUp } from 'lucide-react'
import { useLang } from '@/lib/contexts/LangContext'

interface DashboardClientProps {
  userId: string
  displayName: string | null
}

export default function DashboardClient({ userId, displayName }: DashboardClientProps) {
  const { t, lang } = useLang()
  const ENERGY_LABELS = ['', t.dash_energy_low, t.dash_energy_tired, t.dash_energy_ok, t.dash_energy_good, t.dash_energy_great]
  const days = lang === 'tr' ? ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const today = todayDate()
  const todayLabel = relativeDateLabel(today)

  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [weekStats, setWeekStats] = useState<WeeklyDayStat[]>([])

  const { tasks, loading, fetchTasks, addTask, updateTask, deleteTask, setStatus } = useTaskStore()
  const { timeBlocks, dailyPlan, fetchDayData } = usePlanningStore()
  const { dailySummary, target: nutritionTarget, fetchDayNutrition } = useNutritionStore()
  const { todayWorkout, fetchTodayWorkout } = useWorkoutStore()

  const weekStartDate = toDateString(weekStart(new Date()))
  const calorieTarget = nutritionTarget?.calories ?? APP_DEFAULTS.DEFAULT_CALORIES

  const fetchWeeklyStats = useCallback(async () => {
    try {
      const [tasksByDay, nutritionByDay, workoutsByDay] = await Promise.all([
        getWeeklyTaskStats(supabase, userId, weekStartDate),
        getWeeklyNutritionSummary(supabase, userId, weekStartDate),
        getWeeklyWorkoutStats(supabase, userId, weekStartDate),
      ])

      const stats: WeeklyDayStat[] = Array.from({ length: 7 }, (_, i) => {
        const date = shiftIsoDate(weekStartDate, i)
        const taskStat = tasksByDay.find((t) => t.date === date)
        const nutritionStat = nutritionByDay.find((n) => n.date === date)
        const workoutStat = workoutsByDay.find((w) => w.date === date)

        const tasksTotal = taskStat?.total ?? 0
        const tasksCompleted = taskStat?.completed ?? 0
        const calories = nutritionStat?.calories ?? 0

        return {
          date,
          dayLabel: days[i] ?? date,
          tasksTotal,
          tasksCompleted,
          taskPercent: tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0,
          calories: Math.round(calories),
          caloriePercent: calorieTarget > 0 ? Math.min(100, Math.round((calories / calorieTarget) * 100)) : 0,
          workoutStatus: (workoutStat?.status ?? 'none') as WeeklyDayStat['workoutStatus'],
          caloriesBurned: workoutStat?.caloriesBurned ?? 0,
        }
      })
      setWeekStats(stats)
    } catch {
      // sessiz hata — haftalık chart eksik gösterilir
    }
  }, [userId, weekStartDate, calorieTarget, lang])

  useEffect(() => {
    void fetchTasks(supabase, userId, { scheduled_date: today })
    void fetchDayData(supabase, userId, today)
    void fetchDayNutrition(supabase, userId, today)
    void fetchTodayWorkout(supabase, userId, today)
    void fetchWeeklyStats()
  }, [fetchTasks, fetchDayData, fetchDayNutrition, fetchTodayWorkout, fetchWeeklyStats, userId, today])

  const todayTasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'deferred')
  const completedTasks = tasks.filter((t) => t.status === 'done')
  const totalEffort = todayTasks.reduce((s, t) => s + t.effort_score, 0)

  const calorieConsumed = dailySummary?.calories ?? 0
  const calorieBurned = todayWorkout?.total_calories_burned ?? 0
  const calorieNet = calorieConsumed - calorieBurned
  const caloriePercent = Math.min(100, Math.round((calorieNet / calorieTarget) * 100))

  const handleCreate = useCallback(
    async (input: CreateTaskInput) => {
      await addTask(supabase, userId, { ...input, scheduled_date: today })
    },
    [addTask, today, userId],
  )

  const handleStatusChange = useCallback(
    async (taskId: string, status: TaskStatus) => {
      await setStatus(supabase, taskId, status)
    },
    [setStatus],
  )

  // Bugünün blokları — sadece bugüne ait (saat sırasıyla)
  const todayBlocks = [...timeBlocks].sort((a, b) =>
    a.start_time.localeCompare(b.start_time),
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">{todayLabel}</h1>
          <p className="text-sm text-muted">
            {t.dash_welcome}{displayName ? `, ${displayName}` : ''}
            {dailyPlan?.energy_level ? ` · ${ENERGY_LABELS[dailyPlan.energy_level]}` : ''}
          </p>
        </div>
        <QuickTaskInput onCreateTask={handleCreate} />
      </div>

      {/* Dashboard grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* Zaman Çizelgesi — Sol */}
        <div className="col-span-4 glass rounded-2xl p-4">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-primary">
            <CalendarDays size={15} className="text-accent" /> {t.dash_today_plan}
            <span className="ml-auto text-xs font-normal text-muted">
              {todayBlocks.length} {t.dash_blocks}
            </span>
          </h2>

          {todayBlocks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-8 text-center">
              <p className="text-sm text-muted">{t.dash_no_blocks}</p>
              <Link
                href="/planning"
                className="mt-2 block text-xs text-accent hover:underline"
              >
                {t.dash_go_planning}
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {todayBlocks.map((block) => {
                const color = block.color ?? BLOCK_TYPE_COLORS[block.block_type]
                const label = block.label ?? BLOCK_TYPE_LABELS[block.block_type]
                return (
                  <div
                    key={block.id}
                    className="flex items-center gap-3 rounded-xl px-3 py-2"
                    style={{ backgroundColor: `${color}15` }}
                  >
                    <div
                      className="h-10 w-1 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-sm font-medium"
                        style={{ color }}
                      >
                        {label}
                      </p>
                      <p className="text-xs text-muted">
                        {block.start_time.slice(0, 5)} – {block.end_time.slice(0, 5)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Bugünün görevleri — Orta */}
        <div className="col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold text-primary">
              <CheckSquare size={15} className="text-accent" /> {t.dash_todays_tasks}
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                {todayTasks.length}
              </span>
            </h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          ) : todayTasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border py-12 text-center">
              <p className="text-muted">{t.dash_no_tasks_today}</p>
              <p className="mt-1 text-xs text-muted/60">
                {t.dash_no_tasks_hint}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {todayTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onClick={(t) => {
                    setSelectedTask(t)
                    setDrawerOpen(true)
                  }}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </div>
          )}

          {/* Tamamlananlar */}
          {completedTasks.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-muted">
                {t.dash_completed} ({completedTasks.length})
              </p>
              <div className="space-y-1">
                {completedTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onClick={(t) => {
                      setSelectedTask(t)
                      setDrawerOpen(true)
                    }}
                    onStatusChange={handleStatusChange}
                    compact
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* İstatistikler — Sağ */}
        <div className="col-span-3 space-y-4">
          {/* Progress */}
          <div className="glass rounded-2xl p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary"><BarChart2 size={14} /> {t.dash_summary}</h3>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">{t.dash_task_progress}</span>
                  <span className="font-medium text-primary">
                    {completedTasks.length}/{tasks.length}
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-border/40">
                  <div
                    className="h-2 rounded-full bg-success transition-all"
                    style={{
                      width: tasks.length > 0 ? `${(completedTasks.length / tasks.length) * 100}%` : '0%',
                    }}
                  />
                </div>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted">{t.dash_effort_total}</span>
                <span className="font-medium text-primary">{totalEffort} puan</span>
              </div>
              {dailyPlan?.energy_level && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted">{t.dash_energy}</span>
                  <span className="font-medium text-primary">
                    {ENERGY_LABELS[dailyPlan.energy_level]} ({dailyPlan.energy_level}/5)
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Antrenman özeti */}
          <div className="glass rounded-2xl p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary"><Dumbbell size={14} /> {t.dash_workout}</h3>
            {todayWorkout ? (
              <div className="space-y-2">
                <p className="truncate text-sm font-medium text-primary">
                  {todayWorkout.name ?? 'Antrenman'}
                </p>
                <span
                  className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor:
                      todayWorkout.status === 'completed' ? '#34A85320' :
                      todayWorkout.status === 'in_progress' ? '#F59E0B20' : '#6B728020',
                    color:
                      todayWorkout.status === 'completed' ? '#34A853' :
                      todayWorkout.status === 'in_progress' ? '#F59E0B' : '#6B7280',
                  }}
                >
                  {WORKOUT_STATUS_LABELS[todayWorkout.status]}
                </span>
                {todayWorkout.workout_sets && (
                  <p className="text-xs text-muted">
                    {todayWorkout.workout_sets.length} set tamamlandı
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted">{t.dash_no_workout}</p>
            )}
            <Link
              href="/workout"
              className="mt-3 block text-center text-xs text-accent hover:underline"
            >
              {t.dash_go_workout}
            </Link>
          </div>

          {/* Beslenme özeti */}
          <div className="glass rounded-2xl p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary"><Salad size={14} /> {t.dash_nutrition}</h3>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">Kalori</span>
                  <span className="font-medium text-primary">
                    {Math.round(calorieNet)} / {calorieTarget} kcal
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-border/40">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${Math.max(0, caloriePercent)}%`,
                      backgroundColor: caloriePercent >= 100 ? '#EF4444' : '#4A90D9',
                    }}
                  />
                </div>
                {calorieBurned > 0 && (
                  <p className="mt-1 text-[10px] text-success">
                    -{Math.round(calorieBurned)} kcal antrenman
                  </p>
                )}
              </div>
              {dailySummary && (
                <div className="grid grid-cols-3 gap-1 text-center">
                  {[
                    { label: 'P', value: dailySummary.protein, color: '#3B82F6' },
                    { label: 'K', value: dailySummary.carbs, color: '#F59E0B' },
                    { label: 'Y', value: dailySummary.fat, color: '#EF4444' },
                  ].map((m) => (
                    <div key={m.label}>
                      <p
                        className="text-sm font-semibold"
                        style={{ color: m.color }}
                      >
                        {Math.round(m.value)}g
                      </p>
                      <p className="text-[10px] text-muted">{m.label}</p>
                    </div>
                  ))}
                </div>
              )}
              <Link
                href="/nutrition"
                className="block text-center text-xs text-accent hover:underline"
              >
                Beslenme sayfasına git →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Bu Hafta İstatistikleri */}
      <div className="glass rounded-2xl p-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold text-primary"><TrendingUp size={15} /> {t.dash_this_week}</h3>
          <div className="flex items-center gap-3 text-[10px] text-muted">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-green-400" />
              Görev %
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-4 bg-accent" />
              Kalori
            </span>
          </div>
        </div>
        <WeeklyStatsChart data={weekStats} calorieTarget={calorieTarget} />
      </div>

      {/* Task Detail Drawer */}
      <TaskDetailDrawer
        task={selectedTask}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false)
          setSelectedTask(null)
        }}
        onUpdate={async (taskId, updates) => {
          await updateTask(supabase, taskId, updates)
        }}
        onDelete={async (taskId) => {
          await deleteTask(supabase, taskId)
        }}
        onStatusChange={handleStatusChange}
        onUpdateChecklist={async (taskId, checklist) => {
          await updateTaskDetails(supabase, taskId, { checklist })
          // Refresh task to get updated details
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

