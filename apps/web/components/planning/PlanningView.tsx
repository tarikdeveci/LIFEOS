'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useLang } from '@/lib/contexts/LangContext'
import type { TimeBlock, CreateTimeBlockInput, UpdateTimeBlockInput, Task, RecurrenceType } from '@lifeos/shared'
import {
  todayDate, relativeDateLabel, shiftIsoDate,
  usePlanningStore,
  useTaskStore,
  BLOCK_TYPE_LABELS, BLOCK_TYPE_COLORS, APP_DEFAULTS,
  type BlockType, describeAiError } from '@lifeos/shared'
import { updateTaskDetails, assignTaskToDate } from '@lifeos/shared/supabase'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { DayTimeline } from '@/components/planning/DayTimeline'
import { WeekView } from '@/components/planning/WeekView'
import { MonthView } from '@/components/planning/MonthView'
import { WeeklyGoals } from '@/components/planning/WeeklyGoals'
import { FlexPool } from '@/components/planning/FlexPool'
import { TaskDetailDrawer } from '@/components/tasks/TaskDetailDrawer'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const ENERGY_EMOJIS = ['😴', '😐', '🙂', '😊', '🔥'] as const

interface PlanningViewProps { userId: string }

export function PlanningView({ userId }: PlanningViewProps) {
  const AI_BUFFER_MINUTES = 15
  const {
    date, timeBlocks, dailyPlan, flexTasks, carryoverTasks, loading,
    fetchDayData, addTimeBlock, updateTimeBlock, removeTimeBlock, setEnergyLevel,
  } = usePlanningStore()

  const { setStatus, updateTask, deleteTask, addTask } = useTaskStore()
  const { showToast } = useToast()
  const { t, lang } = useLang()

  const ENERGY_LEVELS = [
    { value: 1, emoji: ENERGY_EMOJIS[0], label: t.dash_energy_low },
    { value: 2, emoji: ENERGY_EMOJIS[1], label: t.dash_energy_tired },
    { value: 3, emoji: ENERGY_EMOJIS[2], label: t.dash_energy_ok },
    { value: 4, emoji: ENERGY_EMOJIS[3], label: t.dash_energy_good },
    { value: 5, emoji: ENERGY_EMOJIS[4], label: t.dash_energy_great },
  ] as const

  // View mode
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day')

  // Agentic chat
  interface ReplanAction {
    action: 'add' | 'remove' | 'move'
    block_id?: string
    block?: { start_time?: string; end_time?: string; block_type?: BlockType; label?: string; task_id?: string }
  }
  interface ChatMessage { role: 'user' | 'assistant'; text: string; actions?: ReplanAction[] }
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput]       = useState('')
  const [chatLoading, setChatLoading]   = useState(false)
  const [pendingActions, setPendingActions] = useState<ReplanAction[] | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatLoading])

  // Task / block modals
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [drawerOpen, setDrawerOpen]     = useState(false)
  const [showAddBlock, setShowAddBlock] = useState(false)
  const [newBlockTime, setNewBlockTime] = useState('09:00')
  const [newBlockEnd, setNewBlockEnd]   = useState('10:00')
  const [newBlockLabel, setNewBlockLabel] = useState('')
  const [newBlockType, setNewBlockType] = useState<BlockType>('focus')

  // Recurring (add modal)
  const [isRecurring, setIsRecurring]     = useState(false)
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('weekly')
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([new Date().getDay()])
  const [recurrenceEnd, setRecurrenceEnd]   = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().split('T')[0]!
  })

  // Selected block detail / edit
  const [selectedBlock, setSelectedBlock] = useState<TimeBlock | null>(null)
  const [editingBlock, setEditingBlock]   = useState(false)
  const [editBlockStart, setEditBlockStart] = useState('')
  const [editBlockEnd, setEditBlockEnd]     = useState('')
  const [editBlockType, setEditBlockType]   = useState<BlockType>('focus')
  const [editBlockLabel, setEditBlockLabel] = useState('')
  const [editIsRecurring, setEditIsRecurring]       = useState(false)
  const [editRecurrenceType, setEditRecurrenceType] = useState<RecurrenceType>('weekly')
  const [editRecurrenceDays, setEditRecurrenceDays] = useState<number[]>([1])
  const [editRecurrenceEnd, setEditRecurrenceEnd]   = useState('')
  const [savingBlock, setSavingBlock] = useState(false)

  // Quick-add task
  const [quickAddTask, setQuickAddTask]     = useState('')
  const [quickAddLoading, setQuickAddLoading] = useState(false)

  // Blok tamamlama (task_id olmayan bloklar için local state)
  const [completedBlockIds, setCompletedBlockIds] = useState<Set<string>>(new Set())

  useEffect(() => { void fetchDayData(supabase, userId) }, [fetchDayData, userId])

  const handleDateChange = useCallback((offset: number) => {
    void fetchDayData(supabase, userId, shiftIsoDate(date, offset))
  }, [date, fetchDayData, userId])

  // ── Recurring date generator ────────────────────────────────────────────────
  const generateRecurringDates = useCallback((
    startDate: string, type: RecurrenceType, days: number[], endDate: string,
  ): string[] => {
    const dates: string[] = []
    const cur = new Date(startDate)
    const end = new Date(endDate)
    cur.setDate(cur.getDate() + 1)
    while (cur <= end) {
      const dow = cur.getDay()
      if (type === 'daily') {
        dates.push(cur.toISOString().split('T')[0]!)
      } else if (type === 'weekly' && days.includes(dow)) {
        dates.push(cur.toISOString().split('T')[0]!)
      } else if (type === 'biweekly' && days.includes(dow)) {
        const startWeek = Math.floor((new Date(startDate).getTime() - new Date('2024-01-01').getTime()) / (7 * 86400000))
        const curWeek   = Math.floor((cur.getTime()               - new Date('2024-01-01').getTime()) / (7 * 86400000))
        if ((curWeek - startWeek) % 2 === 0) dates.push(cur.toISOString().split('T')[0]!)
      } else if (type === 'monthly' && cur.getDate() === new Date(startDate).getDate()) {
        dates.push(cur.toISOString().split('T')[0]!)
      }
      cur.setDate(cur.getDate() + 1)
    }
    return dates
  }, [])

  // ── Add block ───────────────────────────────────────────────────────────────
  const handleAddBlock = useCallback(async () => {
    const baseInput: CreateTimeBlockInput = {
      date, start_time: newBlockTime, end_time: newBlockEnd, block_type: newBlockType,
      ...(newBlockLabel && { label: newBlockLabel }),
      is_recurring: isRecurring,
      ...(isRecurring && { recurrence_type: recurrenceType, recurrence_days: recurrenceDays, recurrence_end: recurrenceEnd }),
    }
    await addTimeBlock(supabase, userId, baseInput)
    if (isRecurring) {
      const futureDates = generateRecurringDates(date, recurrenceType, recurrenceDays, recurrenceEnd)
      for (const futureDate of futureDates) await addTimeBlock(supabase, userId, { ...baseInput, date: futureDate })
      if (futureDates.length > 0) showToast(`${futureDates.length + 1} tekrarlayan blok oluşturuldu`, 'success')
    }
    setShowAddBlock(false); setNewBlockLabel(''); setIsRecurring(false)
  }, [addTimeBlock, userId, date, newBlockTime, newBlockEnd, newBlockType, newBlockLabel,
      isRecurring, recurrenceType, recurrenceDays, recurrenceEnd, generateRecurringDates, showToast])

  const handleSlotClick = useCallback((time: string) => {
    setNewBlockTime(time)
    const [h] = time.split(':').map(Number) as [number, number]
    setNewBlockEnd(`${String(h + 1).padStart(2, '0')}:00`)
    setShowAddBlock(true)
  }, [])

  const openBlockDetail = useCallback((block: TimeBlock) => {
    setSelectedBlock(block); setEditingBlock(false)
    setEditBlockStart(block.start_time.slice(0, 5))
    setEditBlockEnd(block.end_time.slice(0, 5))
    setEditBlockType(block.block_type)
    setEditBlockLabel(block.label ?? '')
    setEditIsRecurring(block.is_recurring ?? false)
    setEditRecurrenceType(block.recurrence_type ?? 'weekly')
    setEditRecurrenceDays(block.recurrence_days ?? [new Date().getDay()])
    setEditRecurrenceEnd(block.recurrence_end ?? (() => {
      const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().split('T')[0]!
    })())
  }, [])

  // ── Save block edit ─────────────────────────────────────────────────────────
  const handleSaveBlockEdit = useCallback(async () => {
    if (!selectedBlock) return
    if (editBlockEnd <= editBlockStart) { showToast('Bitiş saati başlangıçtan sonra olmalı', 'error'); return }
    setSavingBlock(true)
    try {
      const updates: UpdateTimeBlockInput = {
        start_time: editBlockStart, end_time: editBlockEnd,
        block_type: editBlockType, label: editBlockLabel || undefined,
        is_recurring: editIsRecurring,
        ...(editIsRecurring && { recurrence_type: editRecurrenceType, recurrence_days: editRecurrenceDays, recurrence_end: editRecurrenceEnd }),
      }
      await updateTimeBlock(supabase, selectedBlock.id, updates)
      if (editIsRecurring && !selectedBlock.is_recurring) {
        const futureDates = generateRecurringDates(date, editRecurrenceType, editRecurrenceDays, editRecurrenceEnd)
        for (const futureDate of futureDates) {
          await addTimeBlock(supabase, userId, { date: futureDate, start_time: editBlockStart, end_time: editBlockEnd, block_type: editBlockType, label: editBlockLabel || undefined, is_recurring: true, recurrence_type: editRecurrenceType, recurrence_days: editRecurrenceDays, recurrence_end: editRecurrenceEnd })
        }
        if (futureDates.length > 0) showToast(`${futureDates.length + 1} tekrarlayan blok oluşturuldu`, 'success')
      } else {
        showToast('Blok güncellendi', 'success')
      }
      setEditingBlock(false)
      setSelectedBlock((prev) => prev ? { ...prev, ...updates } : null)
    } catch { showToast('Blok güncellenemedi', 'error') }
    finally { setSavingBlock(false) }
  }, [selectedBlock, editBlockStart, editBlockEnd, editBlockType, editBlockLabel, editIsRecurring, editRecurrenceType, editRecurrenceDays, editRecurrenceEnd, updateTimeBlock, addTimeBlock, userId, date, generateRecurringDates, showToast])

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const hasOverlap = useCallback((start: string, end: string): boolean => {
    return timeBlocks.some(
      (b) => b.start_time.slice(0, 5) < end && b.end_time.slice(0, 5) > start,
    )
  }, [timeBlocks])

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

  // ── Agentic chat ────────────────────────────────────────────────────────────
  const handleSendChat = useCallback(async () => {
    if (!chatInput.trim() || chatLoading) return
    const userMsg = chatInput.trim()
    setChatInput(''); setChatMessages((p) => [...p, { role: 'user', text: userMsg }]); setChatLoading(true)
    try {
      let { data: { session } } = await supabase.auth.getSession()
      if (!session) { const { data: r } = await supabase.auth.refreshSession(); session = r.session }
      if (!session) throw new Error('Oturum bulunamadı')
      const { data, error } = await supabase.functions.invoke('ai-suggest', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          type: 'replan', language: lang, date, today: todayDate(), user_message: userMsg, buffer_minutes: AI_BUFFER_MINUTES,
          current_time: new Date().toLocaleTimeString(lang === 'tr' ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
          existing_blocks: timeBlocks.map((b) => ({ id: b.id, start: b.start_time.slice(0, 5), end: b.end_time.slice(0, 5), label: b.label ?? b.block_type })),
        },
      })
      if (error) throw error
      const result = data as { message: string; actions?: ReplanAction[] }
      const actions = result.actions?.filter((a) =>
        (a.action === 'add' && a.block?.start_time && a.block?.end_time) ||
        (a.action === 'remove' && a.block_id) ||
        (a.action === 'move' && a.block_id && a.block?.start_time && a.block?.end_time)
      ) ?? []
      setChatMessages((p) => [...p, { role: 'assistant', text: result.message, actions }])
      if (actions.length > 0) setPendingActions(actions)
    } catch (err) {
      const info = await describeAiError(err, lang)
      if (info.detail) console.error('ai-suggest replan:', info.status, info.detail)
      setChatMessages((p) => [...p, { role: 'assistant', text: info.message }])
    } finally { setChatLoading(false) }
  }, [chatInput, chatLoading, date, timeBlocks])

  const handleApplyPendingActions = useCallback(async () => {
    if (!pendingActions) return
    let added = 0; let removed = 0; let moved = 0
    const removedIds = new Set<string>()
    try {
      // 1. Önce AI'nın explicit remove/move aksiyonlarını uygula
      for (const a of pendingActions) {
        if (a.action === 'remove' && a.block_id && !removedIds.has(a.block_id)) {
          await removeTimeBlock(supabase, a.block_id)
          removedIds.add(a.block_id)
          removed++
        } else if (a.action === 'move' && a.block_id && a.block?.start_time && a.block?.end_time) {
          await updateTimeBlock(supabase, a.block_id, { start_time: a.block.start_time, end_time: a.block.end_time })
          moved++
        }
      }
      // 2. Add aksiyonları: çakışan blokları zorla sil, sonra ekle
      for (const a of pendingActions) {
        if (a.action === 'add' && a.block?.start_time && a.block?.end_time) {
          const latestBlocks = usePlanningStore.getState().timeBlocks
          const conflicts = latestBlocks.filter(
            (b) => !removedIds.has(b.id) && b.start_time.slice(0, 5) < a.block!.end_time! && b.end_time.slice(0, 5) > a.block!.start_time!,
          )
          for (const c of conflicts) {
            await removeTimeBlock(supabase, c.id)
            removedIds.add(c.id)
            removed++
          }
          await addTimeBlock(supabase, userId, {
            date, start_time: a.block.start_time, end_time: a.block.end_time,
            block_type: a.block.block_type ?? 'task', label: a.block.label,
            ...(a.block.task_id && { task_id: a.block.task_id }),
          })
          added++
        }
      }
      const parts = [added > 0 && `${added} blok eklendi`, removed > 0 && `${removed} blok değiştirildi`, moved > 0 && `${moved} blok taşındı`].filter(Boolean)
      showToast(parts.join(', '), 'success')
      setPendingActions(null)
      void fetchDayData(supabase, userId, date)
    } catch {
      showToast('Değişiklikler uygulanamadı — plan yenileniyor', 'error')
      // Partial failures: always refetch to show consistent state
      void fetchDayData(supabase, userId, date)
    }
  }, [pendingActions, userId, date, addTimeBlock, removeTimeBlock, updateTimeBlock, fetchDayData, showToast])

  // ── Assign to timeline / quick-add task ────────────────────────────────────
  const handleAssignToTimeline = useCallback(async (task: Task) => {
    try {
      const durationMinutes = task.effort_score ? task.effort_score * 60 : 60
      const slot = findNextAvailableSlot(Math.min(durationMinutes, 120))
      await assignTaskToDate(supabase, task.id, date)
      await addTimeBlock(supabase, userId, { date, start_time: slot.start, end_time: slot.end, block_type: 'task', label: task.title, task_id: task.id })
      showToast(`"${task.title}" ${slot.start}–${slot.end} arasına eklendi`, 'success')
      void fetchDayData(supabase, userId, date)
    } catch { showToast('Görev atanamadı', 'error') }
  }, [date, userId, addTimeBlock, fetchDayData, showToast, findNextAvailableSlot])

  const handleQuickAddTask = useCallback(async () => {
    const title = quickAddTask.trim()
    if (!title) return
    setQuickAddLoading(true)
    try {
      await addTask(supabase, userId, { title, scheduled_date: date, status: 'planned' })
      setQuickAddTask('')
      void fetchDayData(supabase, userId, date)
      showToast(`"${title}" esnek havuza eklendi`, 'success')
    } catch { showToast('Görev eklenemedi', 'error') }
    finally { setQuickAddLoading(false) }
  }, [quickAddTask, addTask, userId, date, fetchDayData, showToast])

  // ── Computed ────────────────────────────────────────────────────────────────
  const allDayTasks = [...flexTasks, ...carryoverTasks]

  // Block hours: tüm zaman bloklarının süresi (rutin, mola, odak dahil)
  const blockHours = timeBlocks.reduce((s, b) => {
    const [sh = 0, sm = 0] = b.start_time.split(':').map(Number)
    const [eh = 0, em = 0] = b.end_time.split(':').map(Number)
    return s + (eh * 60 + em - sh * 60 - sm) / 60
  }, 0)
  // Flex/carryover görev eforu (zaman bloğuna atanmamış görevler)
  const taskEffortHours = allDayTasks.reduce((s, t) => s + t.effort_score, 0)
  const totalDayEffort = Math.round((blockHours + taskEffortHours) * 10) / 10

  const todayStr = todayDate()
  const isToday = date === todayStr
  const dateLabel = relativeDateLabel(date)

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
              <Button size="sm" variant="outline" onClick={() => setShowAddBlock(true)}>{t.plan_add_block}</Button>
            )}
          </div>
        </div>

        {viewMode === 'week' && (
          <WeekView userId={userId} initialDate={date} onDayClick={(d) => { setViewMode('day'); void fetchDayData(supabase, userId, d) }} />
        )}

        {viewMode === 'month' && (
          <MonthView userId={userId} initialDate={date} onDayClick={(d) => { setViewMode('day'); void fetchDayData(supabase, userId, d) }} />
        )}

        {viewMode === 'day' && (
          <>
            {dailyPlan && !dailyPlan.energy_level && (
              <div className="mb-4 rounded-2xl border border-accent/20 bg-accent/5 p-4">
                <p className="mb-3 text-sm font-medium text-primary">{t.plan_energy_q}</p>
                <div className="flex gap-2">
                  {ENERGY_LEVELS.map((level) => (
                    <button key={level.value} onClick={() => void setEnergyLevel(supabase, level.value as 1|2|3|4|5)}
                      className="flex flex-col items-center gap-1 rounded-xl border border-border px-4 py-2 hover:border-accent hover:bg-accent/5">
                      <span className="text-xl">{level.emoji}</span>
                      <span className="text-[10px] text-muted">{level.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-24">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              </div>
            ) : (
              <div className="glass rounded-2xl p-4 pt-2">
                <DayTimeline timeBlocks={timeBlocks.map((b) => completedBlockIds.has(b.id) ? { ...b, color: '#34A853' } : b)} onSlotClick={handleSlotClick} onBlockClick={openBlockDetail}
                  onBlockDrop={(blockId, newStart, newEnd) => {
                    void updateTimeBlock(supabase, blockId, { start_time: newStart, end_time: newEnd })
                    showToast('Blok taşındı', 'success')
                  }} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Right panel — only in day mode */}
      {viewMode === 'day' && (
        <div className="col-span-4 space-y-4">
          {dailyPlan?.energy_level && (
            <div className="glass rounded-2xl p-4">
              <div className="flex items-center gap-2">
                <span className="text-lg">{ENERGY_LEVELS.find((e) => e.value === dailyPlan.energy_level)?.emoji}</span>
                <span className="text-sm font-medium text-primary">{t.dash_energy}: {ENERGY_LEVELS.find((e) => e.value === dailyPlan.energy_level)?.label}</span>
              </div>
            </div>
          )}

          <div className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-primary">{t.plan_effort_daily}</span>
              <span className={`font-semibold ${totalDayEffort > APP_DEFAULTS.DAILY_EFFORT_LIMIT ? 'text-danger' : totalDayEffort > APP_DEFAULTS.DAILY_EFFORT_LIMIT * 0.8 ? 'text-warning' : 'text-accent'}`}>
                {totalDayEffort}h <span className="font-normal text-muted">/ {APP_DEFAULTS.DAILY_EFFORT_LIMIT}h</span>
              </span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-border/40">
              <div className={`h-2 rounded-full transition-all ${totalDayEffort > APP_DEFAULTS.DAILY_EFFORT_LIMIT ? 'bg-danger' : totalDayEffort > APP_DEFAULTS.DAILY_EFFORT_LIMIT * 0.8 ? 'bg-warning' : 'bg-accent'}`}
                style={{ width: `${Math.min((totalDayEffort / APP_DEFAULTS.DAILY_EFFORT_LIMIT) * 100, 100)}%` }} />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
              <div className="rounded-lg bg-accent/5 px-2 py-1 text-center">
                <p className="font-semibold text-accent">{blockHours.toFixed(1)}h</p>
                <p className="text-muted">blok</p>
              </div>
              <div className="rounded-lg bg-success/5 px-2 py-1 text-center">
                <p className="font-semibold text-success">{taskEffortHours.toFixed(1)}h</p>
                <p className="text-muted">{t.plan_effort_flexible}</p>
              </div>
              <div className="rounded-lg bg-background px-2 py-1 text-center">
                <p className="font-semibold text-muted">{timeBlocks.length}</p>
                <p className="text-muted">blok</p>
              </div>
            </div>
          </div>

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
            <FlexPool tasks={flexTasks} dailyEffortLimit={APP_DEFAULTS.DAILY_EFFORT_LIMIT}
              onTaskClick={(task) => { setSelectedTask(task); setDrawerOpen(true) }}
              onAssignToTimeline={(task) => void handleAssignToTimeline(task)}
              onMarkDone={(taskId) => { void setStatus(supabase, taskId, 'done').then(() => { void fetchDayData(supabase, userId, date); showToast('Görev tamamlandı ✓', 'success') }) }} />
          </div>

          {carryoverTasks.length > 0 && (
            <div className="rounded-2xl border border-warning/30 bg-warning/5 p-4">
              <h3 className="mb-3 text-sm font-semibold text-warning">{t.plan_carryover} ({carryoverTasks.length})</h3>
              <div className="space-y-1.5">
                {carryoverTasks.slice(0, 5).map((task) => (
                  <div key={task.id} className="group flex items-center gap-2 rounded-xl border border-warning/20 bg-background/60 px-3 py-2 transition-all hover:border-warning/40 hover:bg-background/80">
                    <button
                      onClick={() => { setSelectedTask(task); setDrawerOpen(true) }}
                      className="flex-1 truncate text-left text-xs font-medium text-primary"
                    >
                      {task.title}
                    </button>
                    {task.effort_score > 0 && (
                      <span className="shrink-0 rounded-md bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                        {task.effort_score}h
                      </span>
                    )}
                    {/* Tamamla */}
                    <button
                      onClick={() => {
                        void setStatus(supabase, task.id, 'done').then(() => {
                          void fetchDayData(supabase, userId, date)
                          showToast('Görev tamamlandı ✓', 'success')
                        })
                      }}
                      className="shrink-0 rounded-lg p-1 text-muted opacity-0 transition-all hover:bg-success/10 hover:text-success group-hover:opacity-100"
                      title="Tamamla"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                    {/* Pass geç (ertele) */}
                    <button
                      onClick={() => {
                        void setStatus(supabase, task.id, 'deferred').then(() => {
                          void fetchDayData(supabase, userId, date)
                          showToast('Görev ertelendi', 'info')
                        })
                      }}
                      className="shrink-0 rounded-lg p-1 text-muted opacity-0 transition-all hover:bg-warning/10 hover:text-warning group-hover:opacity-100"
                      title="Pass geç (ertele)"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Haftalık Hedefler */}
          <WeeklyGoals userId={userId} />

          {/* Agentic AI Chat */}
          <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-lg shadow-indigo-900/10">
            {/* Header */}
            <div className="flex items-center gap-3 bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg backdrop-blur-sm">
                📅
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{t.plan_ai_assistant}</p>
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-300 shadow-[0_0_4px_rgba(165,180,252,0.8)]" />
                  <span className="text-[10px] text-white/80">{t.plan_ai_online}</span>
                </div>
              </div>
            </div>

            {/* Mesaj alanı */}
            <div className="flex max-h-64 flex-col gap-3 overflow-y-auto bg-gray-50/50 p-4">
              {/* Karşılama balonu — her zaman görünür */}
              <div className="flex items-end gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm">
                  📅
                </div>
                <div className="max-w-[90%] space-y-2">
                  <div className="rounded-2xl rounded-bl-sm bg-white px-3.5 py-2.5 text-xs leading-relaxed text-gray-800 shadow-sm ring-1 ring-black/5">
                    {t.plan_ai_welcome}
                  </div>
                  {chatMessages.length === 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {[t.plan_ai_chip_replan, t.plan_ai_chip_focus, t.plan_ai_chip_break].map((q) => (
                        <button key={q}
                          onClick={() => { setChatInput(q); setTimeout(() => void handleSendChat(), 0) }}
                          className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-medium text-indigo-700 transition hover:bg-indigo-100">
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Konuşma balonları */}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex items-end gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  {msg.role === 'assistant' && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm">
                      📅
                    </div>
                  )}
                  <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'rounded-br-sm bg-accent text-white'
                      : 'rounded-bl-sm bg-white text-gray-800 shadow-sm ring-1 ring-black/5'
                  }`}>
                    <p>{msg.text}</p>
                    {msg.actions && msg.actions.length > 0 && (
                      <div className="mt-2 space-y-0.5 border-t border-white/20 pt-1.5">
                        {msg.actions.map((a, ai) => (
                          <p key={ai} className="text-[10px] opacity-80">
                            {a.action === 'remove' ? '🗑 ' : a.action === 'move' ? '↕ ' : '+ '}
                            {a.block?.start_time && a.block?.end_time ? `${a.block.start_time}–${a.block.end_time} ` : ''}
                            {a.block?.label ?? a.block?.block_type ?? ''}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Yazıyor animasyonu */}
              {chatLoading && (
                <div className="flex items-end gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm">
                    📅
                  </div>
                  <div className="rounded-2xl rounded-bl-sm bg-white px-4 py-3 shadow-sm ring-1 ring-black/5">
                    <div className="flex items-center gap-1">
                      {[0, 150, 300].map((delay) => (
                        <span key={delay} className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce"
                          style={{ animationDelay: `${delay}ms` }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Pending actions karar kartı */}
            {pendingActions && pendingActions.length > 0 && (
              <div className="mx-3 mb-3 overflow-hidden rounded-xl border border-indigo-200 bg-indigo-50">
                <div className="px-3 py-2">
                  <p className="text-xs font-semibold text-indigo-800">
                    🤖 {pendingActions.length} değişiklik önerisi
                  </p>
                  <div className="mt-1.5 space-y-0.5">
                    {pendingActions.slice(0, 3).map((a, i) => (
                      <p key={i} className="text-[11px] text-indigo-600">
                        {a.action === 'remove' ? '🗑' : a.action === 'move' ? '↕' : '+'}{' '}
                        {a.block?.start_time && a.block?.end_time ? `${a.block.start_time}–${a.block.end_time}` : ''}{' '}
                        {a.block?.label ?? a.block?.block_type ?? ''}
                      </p>
                    ))}
                    {pendingActions.length > 3 && (
                      <p className="text-[11px] text-indigo-400">+{pendingActions.length - 3} daha…</p>
                    )}
                  </div>
                </div>
                <div className="flex border-t border-indigo-200">
                  <button onClick={() => void handleApplyPendingActions()}
                    className="flex-1 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50">
                    ✓ {t.plan_apply_yes}
                  </button>
                  <div className="w-px bg-indigo-200" />
                  <button onClick={() => setPendingActions(null)}
                    className="flex-1 py-2 text-xs font-medium text-gray-500 transition hover:bg-gray-50">
                    {t.plan_cancel}
                  </button>
                </div>
              </div>
            )}

            {/* Input */}
            <div className="border-t border-gray-100 p-3">
              <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-indigo-400 focus-within:bg-white transition-colors">
                <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSendChat() } }}
                  placeholder={t.plan_replan_placeholder}
                  className="flex-1 bg-transparent text-xs text-gray-800 outline-none placeholder:text-gray-400"
                  disabled={chatLoading} />
                <button onClick={() => void handleSendChat()}
                  disabled={chatLoading || !chatInput.trim()}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500 text-white transition hover:bg-indigo-600 disabled:opacity-40">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
              <p className="mt-1.5 text-[10px] text-gray-400">{t.plan_replan_hint}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Block Modal ── */}
      <Modal open={showAddBlock} onClose={() => setShowAddBlock(false)} title={t.plan_add_block_title} size="sm">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label={t.plan_start} type="time" value={newBlockTime} onChange={(e) => setNewBlockTime(e.target.value)} />
            <Input label={t.plan_end} type="time" value={newBlockEnd} onChange={(e) => setNewBlockEnd(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-primary">{t.plan_block_type}</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(BLOCK_TYPE_LABELS) as BlockType[]).map((type) => (
                <button key={type} onClick={() => setNewBlockType(type)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${newBlockType === type ? 'bg-accent text-white' : 'bg-border/40 text-muted hover:bg-border/60'}`}>
                  {BLOCK_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>
          <Input label={t.plan_label} value={newBlockLabel} onChange={(e) => setNewBlockLabel(e.target.value)} placeholder={t.plan_label_placeholder} />

          {/* Tekrarlama */}
          <div className="rounded-xl border border-border/60 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-primary">
              <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} className="rounded" />
              {t.plan_recurring}
            </label>
            {isRecurring && (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {([['daily', t.plan_recur_daily],['weekly', t.plan_recur_weekly],['biweekly', t.plan_recur_biweekly],['monthly', t.plan_recur_monthly]] as [RecurrenceType,string][]).map(([val, lbl]) => (
                    <button key={val} onClick={() => setRecurrenceType(val)}
                      className={`rounded-lg px-3 py-1 text-xs font-medium ${recurrenceType === val ? 'bg-accent text-white' : 'bg-border/40 text-muted hover:bg-border/60'}`}>{lbl}</button>
                  ))}
                </div>
                {(recurrenceType === 'weekly' || recurrenceType === 'biweekly') && (
                  <div className="flex gap-1">
                    {['Pzr','Pzt','Sal','Çar','Per','Cum','Cmt'].map((day, i) => (
                      <button key={i} onClick={() => setRecurrenceDays((p) => p.includes(i) ? p.filter((d) => d !== i) : [...p, i])}
                        className={`rounded-lg px-2 py-1 text-[10px] font-medium ${recurrenceDays.includes(i) ? 'bg-accent text-white' : 'bg-border/40 text-muted hover:bg-border/60'}`}>{day}</button>
                    ))}
                  </div>
                )}
                <Input label={t.plan_end_date} type="date" value={recurrenceEnd} onChange={(e) => setRecurrenceEnd(e.target.value)} />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowAddBlock(false)}>{t.plan_cancel}</Button>
            <Button size="sm" onClick={() => void handleAddBlock()}>{isRecurring ? t.plan_add_repeat : t.plan_add}</Button>
          </div>
        </div>
      </Modal>

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
      <Modal open={!!selectedBlock} onClose={() => { setSelectedBlock(null); setEditingBlock(false) }}
        title={editingBlock ? t.plan_edit_block_title : t.plan_block_detail} size="sm">
        {selectedBlock && (
          <div className="space-y-4">
            {editingBlock ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Input label={t.plan_start} type="time" value={editBlockStart} onChange={(e) => setEditBlockStart(e.target.value)} />
                  <Input label={t.plan_end} type="time" value={editBlockEnd} onChange={(e) => setEditBlockEnd(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-primary">{t.plan_block_type}</label>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(BLOCK_TYPE_LABELS) as BlockType[]).map((type) => (
                      <button key={type} onClick={() => setEditBlockType(type)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${editBlockType === type ? 'bg-accent text-white' : 'bg-border/40 text-muted hover:bg-border/60'}`}>
                        {BLOCK_TYPE_LABELS[type]}
                      </button>
                    ))}
                  </div>
                </div>
                <Input label={t.plan_label} value={editBlockLabel} onChange={(e) => setEditBlockLabel(e.target.value)} />

                {/* Tekrarlama edit */}
                <div className="rounded-xl border border-border/60 p-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-primary">
                    <input type="checkbox" checked={editIsRecurring} onChange={(e) => setEditIsRecurring(e.target.checked)} className="rounded" />
                    {t.plan_recurring}
                  </label>
                  {editIsRecurring && (
                    <div className="mt-3 space-y-3">
                      <div className="flex flex-wrap gap-1.5">
                        {([['daily', t.plan_recur_daily],['weekly', t.plan_recur_weekly],['biweekly', t.plan_recur_biweekly],['monthly', t.plan_recur_monthly]] as [RecurrenceType,string][]).map(([val, lbl]) => (
                          <button key={val} onClick={() => setEditRecurrenceType(val)}
                            className={`rounded-lg px-3 py-1 text-xs font-medium ${editRecurrenceType === val ? 'bg-accent text-white' : 'bg-border/40 text-muted hover:bg-border/60'}`}>{lbl}</button>
                        ))}
                      </div>
                      {(editRecurrenceType === 'weekly' || editRecurrenceType === 'biweekly') && (
                        <div className="flex gap-1">
                          {['Pzr','Pzt','Sal','Çar','Per','Cum','Cmt'].map((day, i) => (
                            <button key={i} onClick={() => setEditRecurrenceDays((p) => p.includes(i) ? p.filter((d) => d !== i) : [...p, i])}
                              className={`rounded-lg px-2 py-1 text-[10px] font-medium ${editRecurrenceDays.includes(i) ? 'bg-accent text-white' : 'bg-border/40 text-muted hover:bg-border/60'}`}>{day}</button>
                          ))}
                        </div>
                      )}
                      <Input label={t.plan_end_date} type="date" value={editRecurrenceEnd} onChange={(e) => setEditRecurrenceEnd(e.target.value)} />
                    </div>
                  )}
                </div>

                <div className="flex justify-between gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditingBlock(false)} disabled={savingBlock}>{t.plan_cancel}</Button>
                  <Button size="sm" onClick={() => void handleSaveBlockEdit()} disabled={savingBlock}>{savingBlock ? 'Kaydediliyor…' : 'Kaydet'}</Button>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-xl p-4" style={{ backgroundColor: `${selectedBlock.color ?? BLOCK_TYPE_COLORS[selectedBlock.block_type]}15` }}>
                  <p className="text-lg font-semibold" style={{ color: selectedBlock.color ?? BLOCK_TYPE_COLORS[selectedBlock.block_type] }}>
                    {selectedBlock.label ?? BLOCK_TYPE_LABELS[selectedBlock.block_type]}
                  </p>
                  <p className="mt-1 text-sm text-muted">{selectedBlock.start_time.slice(0, 5)} – {selectedBlock.end_time.slice(0, 5)}</p>
                  <p className="mt-1 text-xs text-muted">Tip: {BLOCK_TYPE_LABELS[selectedBlock.block_type]}</p>
                  {selectedBlock.is_recurring && (
                    <p className="mt-1 text-xs font-medium text-accent">
                      🔄 Tekrarlayan · {selectedBlock.recurrence_type === 'daily' ? 'Her gün' : selectedBlock.recurrence_type === 'weekly' ? 'Haftalık' : selectedBlock.recurrence_type === 'biweekly' ? '2 haftada bir' : 'Aylık'}
                      {selectedBlock.recurrence_end ? ` · ${selectedBlock.recurrence_end}'e kadar` : ''}
                    </p>
                  )}
                </div>
                {selectedBlock.block_type === 'workout' && (
                  <Link href="/workout" className="flex items-center gap-2 rounded-xl border border-pink-200 bg-pink-50 px-3 py-2 text-sm font-medium text-pink-700 hover:bg-pink-100">
                    <span>{t.plan_go_workout}</span>
                  </Link>
                )}
                {selectedBlock.block_type === 'meal' && (
                  <Link href="/nutrition" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100">
                    <span>{t.plan_go_nutrition}</span>
                  </Link>
                )}
                {/* Tüm bloklar için tamamlama — task_id varsa görevi done yap, yoksa local işaretle */}
                {completedBlockIds.has(selectedBlock.id) ? (
                  <div className="flex items-center justify-center gap-2 rounded-xl bg-success/10 py-2.5">
                    <span className="text-sm font-semibold text-success">{t.plan_done}</span>
                    <button
                      onClick={() => setCompletedBlockIds((p) => { const n = new Set(p); n.delete(selectedBlock.id); return n })}
                      className="text-[10px] text-muted hover:text-primary"
                    >{t.plan_undo}</button>
                  </div>
                ) : (
                  <button
                    onClick={async () => {
                      if (selectedBlock.task_id) {
                        await setStatus(supabase, selectedBlock.task_id, 'done')
                        void fetchDayData(supabase, userId, date)
                      }
                      setCompletedBlockIds((p) => new Set(p).add(selectedBlock.id))
                      showToast('Tamamlandı ✓', 'success')
                      setSelectedBlock(null)
                    }}
                    className="w-full rounded-xl bg-success/10 py-2.5 text-sm font-medium text-success hover:bg-success/20"
                  >
                    {t.plan_mark_done}
                  </button>
                )}
                <div className="flex justify-between gap-2">
                  <Button variant="danger" size="sm" onClick={() => { void removeTimeBlock(supabase, selectedBlock.id); setSelectedBlock(null) }}>{t.plan_delete}</Button>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditingBlock(true)}>{t.plan_edit}</Button>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedBlock(null)}>{t.plan_close}</Button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
