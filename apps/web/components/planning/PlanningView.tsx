'use client'

import { useState, useEffect, useCallback } from 'react'
import { useLang } from '@/lib/contexts/LangContext'
import type { Task } from '@lifeos/shared'
import {
  todayDate, relativeDateLabel, shiftIsoDate,
  usePlanningStore,
  useTaskStore,
  useRoutineStore,
  APP_DEFAULTS } from '@lifeos/shared'
import { updateTaskDetails, assignTaskToDate, track } from '@lifeos/shared/supabase'
import { supabase } from '@/lib/supabase/client'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { useFreeAiPlans } from '@/lib/hooks/useFreeAiPlans'
import { usePlanningAiChat } from '@/lib/hooks/usePlanningAiChat'
import { usePlanningBlockEditor } from '@/lib/hooks/usePlanningBlockEditor'
import { useToast } from '@/components/ui/Toast'
import { DayTimeline } from '@/components/planning/DayTimeline'
import { WeekView } from '@/components/planning/WeekView'
import { MonthView } from '@/components/planning/MonthView'
import { GoalsPanel } from '@/components/planning/GoalsPanel'
import { DayStartCard } from '@/components/planning/DayStartCard'
import { FlexPool } from '@/components/planning/FlexPool'
import { WeeklyRoutines } from '@/components/planning/WeeklyRoutines'
import { HabitsToday } from '@/components/planning/HabitsToday'
import { CarryoverList } from '@/components/planning/CarryoverList'
import { CapacityBar } from '@/components/planning/CapacityBar'
import { ShiftButton } from '@/components/planning/ShiftButton'
import { MorningRitual } from '@/components/planning/MorningRitual'
import { PlanningAiChat } from '@/components/planning/PlanningAiChat'
import { AddBlockModal } from '@/components/planning/AddBlockModal'
import { BlockDetailModal } from '@/components/planning/BlockDetailModal'
import { TaskDetailDrawer } from '@/components/tasks/TaskDetailDrawer'
import { Button } from '@/components/ui/Button'

interface PlanningViewProps { userId: string }

export function PlanningView({ userId }: PlanningViewProps) {
  const {
    date, timeBlocks, flexTasks, carryoverTasks, busy, loading,
    fetchDayData, addTimeBlock, updateTimeBlock,
  } = usePlanningStore()

  const { setStatus, updateTask, deleteTask, addTask } = useTaskStore()
  const { fetchRoutines } = useRoutineStore()
  const [ritualOpen, setRitualOpen] = useState(false)
  // Rutin değişince hafta görünümü kendi verisini yeniden okusun diye anahtar.
  const [routinesVersion, setRoutinesVersion] = useState(0)
  const { showToast } = useToast()
  const { t, lang } = useLang()
  const { isPro, loading: subLoading } = useSubscription()
  const { freePlansLeft, refreshFreePlans } = useFreeAiPlans(isPro, subLoading)
  // Free kullanıcı 3 AI planlama hakkını bitirdiyse sohbet kutusu yerine Pro
  // çağrısı çıkar. null (sayaç okunamadı) kilitlemez: kararı sunucu verir.
  const freePlansUsedUp = !isPro && freePlansLeft === 0

  // ProGate'teki gibi: kilit gerçekten gösterildiğinde paywall_view yazılır
  useEffect(() => {
    if (freePlansUsedUp) void track(supabase, userId, 'paywall_view', { source: 'free_limit' })
  }, [freePlansUsedUp, userId])

  // View mode
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day')

  // Agentic chat: durum burada yaşar, hafta/ay görünümüne geçilince sohbet silinmez.
  const chat = usePlanningAiChat({
    userId, isPro, freePlansUsedUp, refreshFreePlans,
    onAsk: () => setViewMode('day'),
  })

  // Task drawer
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [drawerOpen, setDrawerOpen]     = useState(false)

  // Quick-add task
  const [quickAddTask, setQuickAddTask]     = useState('')
  const [quickAddLoading, setQuickAddLoading] = useState(false)


  useEffect(() => { void fetchDayData(supabase, userId) }, [fetchDayData, userId])
  useEffect(() => { void fetchRoutines(supabase, userId) }, [fetchRoutines, userId])

  /** Rutin serisi değişti: gün ve hafta görünümü sunucunun ürettiği örnekleri yeniden okur. */
  const refreshAfterRoutineChange = useCallback(() => {
    setRoutinesVersion((v) => v + 1)
    void fetchDayData(supabase, userId, date)
  }, [fetchDayData, userId, date])

  const handleDateChange = useCallback((offset: number) => {
    void fetchDayData(supabase, userId, shiftIsoDate(date, offset))
  }, [date, fetchDayData, userId])

  // Blok ekleme ve detay/düzenleme pencerelerinin durumu ile kaydet/sil işlemleri.
  const blockEditor = usePlanningBlockEditor({ userId, refreshAfterRoutineChange })
  const { handleSlotClick, openAddBlock, openBlockDetail } = blockEditor

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const findNextAvailableSlot = useCallback((durationMinutes = 60): { start: string; end: string } => {
    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    let candidateStart = Math.max(Math.ceil(currentMinutes / 30) * 30, 9 * 60)

    for (let i = 0; i < 32; i++) {
      const candidateEnd = candidateStart + durationMinutes
      if (candidateEnd > 23 * 60) break
      const startStr = `${String(Math.floor(candidateStart / 60)).padStart(2, '0')}:${String(candidateStart % 60).padStart(2, '0')}`
      const endStr = `${String(Math.floor(candidateEnd / 60)).padStart(2, '0')}:${String(candidateEnd % 60).padStart(2, '0')}`
      if (!timeBlocks.some((b) => b.start_time.slice(0, 5) < endStr && b.end_time.slice(0, 5) > startStr)) {
        return { start: startStr, end: endStr }
      }
      candidateStart += 30
    }
    return { start: '20:00', end: '21:00' }
  }, [timeBlocks])

  // ── Assign to timeline / quick-add task ────────────────────────────────────
  const handleAssignToTimeline = useCallback(async (task: Task) => {
    try {
      const durationMinutes = task.effort_score ? task.effort_score * 60 : 60
      const slot = findNextAvailableSlot(Math.min(durationMinutes, 120))
      await assignTaskToDate(supabase, task.id, date)
      await addTimeBlock(supabase, userId, { date, start_time: slot.start, end_time: slot.end, block_type: 'task', label: task.title, task_id: task.id })
      showToast(t.plan_assigned_toast.replace('{title}', () => task.title).replace('{start}', slot.start).replace('{end}', slot.end), 'success')
      void fetchDayData(supabase, userId, date)
    } catch { showToast(t.plan_assign_error, 'error') }
  }, [date, userId, addTimeBlock, fetchDayData, showToast, findNextAvailableSlot, t])

  const handleQuickAddTask = useCallback(async () => {
    const title = quickAddTask.trim()
    if (!title) return
    setQuickAddLoading(true)
    try {
      await addTask(supabase, userId, { title, scheduled_date: date, status: 'planned' })
      setQuickAddTask('')
      void fetchDayData(supabase, userId, date)
      showToast(t.plan_flex_added.replace('{title}', () => title), 'success')
    } catch { showToast(t.plan_task_add_error, 'error') }
    finally { setQuickAddLoading(false) }
  }, [quickAddTask, addTask, userId, date, fetchDayData, showToast, t])

  // ── Computed ────────────────────────────────────────────────────────────────
  const allDayTasks = [...flexTasks, ...carryoverTasks]
  // Gece devrinin bugüne taşıdıkları esnek havuzda değil "Dünden kalanlar"da görünür.
  const carriedToday = date === todayDate() ? flexTasks.filter((task) => task.carry_count > 0) : []
  const freshFlexTasks = carriedToday.length > 0 ? flexTasks.filter((task) => !(task.carry_count > 0)) : flexTasks

  // Kapasite: güne atanmış ama henüz bloğa konmamış görevler.
  const unblockedTasks = allDayTasks.filter((task) => !timeBlocks.some((b) => b.task_id === task.id))

  const todayStr = todayDate()
  const isToday = date === todayStr
  const dateLabel = relativeDateLabel(date, lang)

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Main area */}
      <div className={viewMode === 'day' ? 'col-span-8' : 'col-span-12'}>
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {viewMode === 'day' ? (
              <>
                <button onClick={() => handleDateChange(-1)} className="rounded-lg p-1.5 text-muted hover:bg-border/40">←</button>
                <h2 className="text-lg font-bold text-primary">{dateLabel}</h2>
                <button onClick={() => handleDateChange(1)} className="rounded-lg p-1.5 text-muted hover:bg-border/40">→</button>
                {!isToday && (
                  <button onClick={() => void fetchDayData(supabase, userId, todayStr)}
                    className="rounded-lg bg-accent/10 px-3 py-1 text-xs font-medium text-accent">{t.plan_today_btn}</button>
                )}
              </>
            ) : (
              <h2 className="text-lg font-bold text-primary">{viewMode === 'week' ? t.plan_week_view : t.plan_month_view}</h2>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* View switcher */}
            <div className="flex rounded-xl border border-border bg-background p-0.5">
              {(['day', 'week', 'month'] as const).map((v) => (
                <button key={v} onClick={() => setViewMode(v)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${viewMode === v ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-primary'}`}>
                  {v === 'day' ? t.plan_tab_day : v === 'week' ? t.plan_tab_week : t.plan_tab_month}
                </button>
              ))}
            </div>
            {viewMode === 'day' && (
              <>
                {isToday && <ShiftButton />}
                <Button size="sm" variant="outline" onClick={openAddBlock}>{t.plan_add_block}</Button>
              </>
            )}
          </div>
        </div>

        {viewMode === 'week' && (
          <>
            <WeekView key={routinesVersion} userId={userId} initialDate={date} onDayClick={(d) => { setViewMode('day'); void fetchDayData(supabase, userId, d) }} />
            <WeeklyRoutines userId={userId} onChanged={refreshAfterRoutineChange} />
          </>
        )}

        {viewMode === 'month' && (
          <MonthView userId={userId} initialDate={date} onDayClick={(d) => { setViewMode('day'); void fetchDayData(supabase, userId, d) }} />
        )}

        {viewMode === 'day' && (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-24">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              </div>
            ) : (
              <div className="glass rounded-2xl p-4 pt-2">
                <DayTimeline busy={busy} timeBlocks={timeBlocks.map((b) => (b.completed_at ? { ...b, color: '#34A853' } : b))} onSlotClick={handleSlotClick} onBlockClick={openBlockDetail}
                  onBlockDrop={(blockId, newStart, newEnd) => {
                    updateTimeBlock(supabase, blockId, { start_time: newStart, end_time: newEnd })
                      .then(() => showToast(t.plan_block_moved, 'success'))
                      .catch(() => {
                        // Store iyimser güncelledi, yazma düştü: günü yeniden okuyup eski saate dön.
                        showToast(t.plan_block_update_error, 'error')
                        void fetchDayData(supabase, userId, date)
                      })
                  }} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Right panel: only in day mode */}
      {viewMode === 'day' && (
        <div className="col-span-4 space-y-4">
          <DayStartCard isToday={isToday} onStartRitual={() => setRitualOpen(true)} />

          <CapacityBar tasks={unblockedTasks} timeBlocks={timeBlocks} isToday={isToday} busy={busy} />

          {/* Esnek Havuz + Quick add */}
          <div className="glass rounded-2xl p-4">
            <h3 className="mb-3 text-sm font-semibold text-primary">{t.plan_flexible_tasks}</h3>
            <div className="mb-3 flex gap-2">
              <input value={quickAddTask} onChange={(e) => setQuickAddTask(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleQuickAddTask() }}
                placeholder={t.plan_add_task}
                className="flex-1 rounded-xl border border-dashed border-border bg-background px-3 py-1.5 text-xs text-primary outline-none focus:border-accent focus:bg-surface"
                disabled={quickAddLoading} />
              <button onClick={() => void handleQuickAddTask()} disabled={quickAddLoading || !quickAddTask.trim()}
                className="rounded-xl bg-accent/10 px-2.5 py-1.5 text-xs font-bold text-accent hover:bg-accent/20 disabled:opacity-40">
                {quickAddLoading ? '…' : '+'}
              </button>
            </div>
            <FlexPool tasks={freshFlexTasks} dailyEffortLimit={APP_DEFAULTS.DAILY_EFFORT_LIMIT}
              onTaskClick={(task) => { setSelectedTask(task); setDrawerOpen(true) }}
              onAssignToTimeline={(task) => void handleAssignToTimeline(task)}
              onMarkDone={(taskId) => {
                setStatus(supabase, taskId, 'done')
                  .then(() => { void fetchDayData(supabase, userId, date); showToast(t.plan_task_done_toast, 'success') })
                  .catch(() => showToast(t.plan_task_update_error, 'error'))
              }} />
          </div>

          {isToday && <HabitsToday userId={userId} />}

          <CarryoverList tasks={[...carryoverTasks, ...carriedToday]}
            onOpen={(task) => { setSelectedTask(task); setDrawerOpen(true) }}
            onChanged={() => void fetchDayData(supabase, userId, date)} />

          {/* Haftalık Hedefler */}
          <GoalsPanel userId={userId} onStepToggle={() => void fetchDayData(supabase, userId, date)} />

          {/* Agentic AI Chat */}
          <PlanningAiChat chat={chat} isPro={isPro} freePlansLeft={freePlansLeft} freePlansUsedUp={freePlansUsedUp} />
        </div>
      )}

      <MorningRitual userId={userId} open={ritualOpen} onClose={() => setRitualOpen(false)}
        carried={[...carryoverTasks, ...carriedToday]} />

      {/* ── Add Block Modal ── */}
      <AddBlockModal editor={blockEditor} />

      {/* ── Task Detail Drawer ── */}
      <TaskDetailDrawer task={selectedTask} open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelectedTask(null) }}
        onUpdate={async (taskId, updates) => { await updateTask(supabase, taskId, updates) }}
        onDelete={async (taskId) => { await deleteTask(supabase, taskId) }}
        onStatusChange={async (taskId, status) => { await setStatus(supabase, taskId, status) }}
        onUpdateChecklist={async (taskId, checklist) => {
          await updateTaskDetails(supabase, taskId, { checklist })
          if (selectedTask?.id === taskId) {
            setSelectedTask({ ...selectedTask, task_details: selectedTask.task_details ? { ...selectedTask.task_details, checklist } : undefined })
          }
        }} />

      {/* ── Block Detail / Edit Modal ── */}
      <BlockDetailModal userId={userId} editor={blockEditor} />
    </div>
  )
}
