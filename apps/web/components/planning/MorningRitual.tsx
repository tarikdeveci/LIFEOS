'use client'

import { useEffect, useState } from 'react'
import type { Task } from '@lifeos/shared'
import { autoPlace, minutesOfDay, todayDate, usePlanningStore, useTaskStore } from '@lifeos/shared'
import { assignTaskToDate, getBacklogTasks } from '@lifeos/shared/supabase'
import { supabase } from '@/lib/supabase/client'
import { useLang } from '@/lib/contexts/LangContext'
import { useToast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { CapacityBar } from '@/components/planning/CapacityBar'

interface MorningRitualProps {
  userId: string
  open: boolean
  onClose: () => void
  /** Dünden kalanlar (tarihi geçmiş + gece devrinin taşıdıkları). */
  carried: Task[]
}

/** Ritüelin durumu: adım, backlog listesi, seçilenler, meşgul bayrağı. */
function useRitualState(open: boolean, userId: string) {
  const [step, setStep] = useState(0)
  const [backlog, setBacklog] = useState<Task[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setStep(0); setPicked(new Set()); setBacklog(null)
    void (async () => {
      try {
        const tasks = await getBacklogTasks(supabase, userId)
        setBacklog([...tasks].sort((a, b) => b.priority_score - a.priority_score))
      } catch { setBacklog([]) }
    })()
  }, [open, userId])

  const toggle = (id: string) => setPicked((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  return { step, setStep, backlog, picked, toggle, busy, setBusy }
}

/**
 * Sabah ritüeli, üç adım: (1) dünden kalanları tut ya da backloga at, (2) backlog'dan
 * bugüne seç, (3) otomatik yerleştir (AI değil, dayPlan.autoPlace). Bitince
 * daily_plans.ritual_completed_at yazılır ve o gün tekrar açılmaz.
 */
export function MorningRitual({ userId, open, onClose, carried }: MorningRitualProps) {
  const { t } = useLang()
  const { showToast } = useToast()
  const { flexTasks, timeBlocks, busy, fetchDayData, placeTasks, completeRitual } = usePlanningStore()
  const { updateTask } = useTaskStore()
  const s = useRitualState(open, userId)
  const [handled, setHandled] = useState<Set<string>>(new Set())
  useEffect(() => { if (open) setHandled(new Set()) }, [open])

  const today = todayDate()
  const pendingCarried = carried.filter((task) => !handled.has(task.id))
  const unblocked = flexTasks.filter((task) => !timeBlocks.some((b) => b.task_id === task.id))

  const decide = async (task: Task, keep: boolean) => {
    setHandled((prev) => new Set(prev).add(task.id))
    try {
      await updateTask(supabase, task.id, keep
        ? { status: 'planned', scheduled_date: today, carry_count: 0 }
        : { status: 'backlog', scheduled_date: null })
    } catch {
      // Yazılamadıysa satır geri gelsin: yoksa görev listeden kaybolur ve yeniden denenemez.
      setHandled((prev) => { const next = new Set(prev); next.delete(task.id); return next })
      showToast(t.plan_task_update_error, 'error')
    }
  }

  const goToPlace = async () => {
    s.setBusy(true)
    try {
      await Promise.all([...s.picked].map((id) => assignTaskToDate(supabase, id, today)))
      await fetchDayData(supabase, userId, today)
      s.setStep(2)
    } catch { showToast(t.plan_tasks_add_error, 'error') }
    finally { s.setBusy(false) }
  }

  const leaveStepOne = async () => {
    // Karar verilmeyen devredenler bugüne alınır; sayaçları sıfırlanmaz, açık onay değil.
    try {
      await Promise.all(pendingCarried.filter((task) => task.scheduled_date !== today)
        .map((task) => updateTask(supabase, task.id, { status: 'planned', scheduled_date: today })))
    } catch { showToast(t.plan_task_update_error, 'error') }
    s.setStep(1)
  }

  const handleAutoPlace = async () => {
    s.setBusy(true)
    try {
      const { placements, unplaced } = autoPlace(unblocked, timeBlocks, { from: minutesOfDay(), gap: 10, busy })
      const titles = Object.fromEntries(unblocked.map((task) => [task.id, task.title]))
      const n = await placeTasks(supabase, userId, placements, titles)
      const msg = [t.ritual_placed.replace('{n}', String(n))]
      if (unplaced.length > 0) msg.push(t.ritual_unplaced.replace('{n}', String(unplaced.length)))
      showToast(msg.join(' · '), 'success')
    } catch { showToast(t.plan_tasks_place_error, 'error') }
    finally { s.setBusy(false) }
  }

  const finish = async () => {
    try { await completeRitual(supabase) } catch { /* ritüel yine kapanır, yarın tekrar sorulmaz diye zorlamıyoruz */ }
    onClose()
  }

  const titles = [t.ritual_step1, t.ritual_step2, t.ritual_step3]

  return (
    <Modal open={open} onClose={onClose} title={t.ritual_title} size="md">
      <div className="space-y-4">
        <div className="flex gap-1.5">
          {titles.map((title, i) => (
            <div key={title} className={`flex-1 rounded-lg px-2 py-1 text-center text-[10px] font-medium ${i === s.step ? 'bg-accent text-white' : i < s.step ? 'bg-accent/10 text-accent' : 'bg-border/40 text-muted'}`}>
              {i + 1}. {title}
            </div>
          ))}
        </div>

        {s.step === 0 && (
          <div className="space-y-1.5">
            {pendingCarried.length === 0 && <p className="py-4 text-center text-xs text-muted">{t.ritual_step1_empty}</p>}
            {pendingCarried.map((task) => (
              <div key={task.id} className="flex items-center gap-2 rounded-xl bg-background/60 px-3 py-2">
                <span className="flex-1 truncate text-xs font-medium text-primary">{task.title}</span>
                <button onClick={() => void decide(task, true)} className="rounded-lg bg-accent/10 px-2 py-1 text-[10px] font-medium text-accent hover:bg-accent/20">{t.ritual_keep}</button>
                <button onClick={() => void decide(task, false)} className="rounded-lg bg-border/40 px-2 py-1 text-[10px] font-medium text-muted hover:bg-border/60">{t.ritual_backlog}</button>
              </div>
            ))}
          </div>
        )}

        {s.step === 1 && (
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {s.backlog === null && <div className="mx-auto my-6 h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />}
            {s.backlog?.length === 0 && <p className="py-4 text-center text-xs text-muted">{t.ritual_step2_empty}</p>}
            {s.backlog?.map((task) => (
              <label key={task.id} className="flex cursor-pointer items-center gap-2 rounded-xl bg-background/60 px-3 py-2">
                <input type="checkbox" checked={s.picked.has(task.id)} onChange={() => s.toggle(task.id)} className="rounded" />
                <span className="flex-1 truncate text-xs font-medium text-primary">{task.title}</span>
                <span className="text-[10px] text-muted">{task.priority_score.toFixed(1)}</span>
              </label>
            ))}
          </div>
        )}

        {s.step === 2 && (
          <div className="space-y-3">
            <CapacityBar tasks={unblocked} timeBlocks={timeBlocks} isToday busy={busy} />
            <p className="text-xs text-muted">{t.ritual_step3_hint}</p>
            <Button size="sm" variant="outline" onClick={() => void handleAutoPlace()} disabled={s.busy || unblocked.length === 0}>
              {t.ritual_auto_place} ({unblocked.length})
            </Button>
          </div>
        )}

        <div className="flex justify-between gap-2">
          {s.step > 0
            ? <Button variant="ghost" size="sm" onClick={() => s.setStep(s.step - 1)} disabled={s.busy}>{t.ritual_back}</Button>
            : <span />}
          {s.step === 0 && <Button size="sm" onClick={() => void leaveStepOne()}>{t.ritual_next}</Button>}
          {s.step === 1 && <Button size="sm" onClick={() => void goToPlace()} disabled={s.busy}>{t.ritual_next}</Button>}
          {s.step === 2 && <Button size="sm" onClick={() => void finish()} disabled={s.busy}>{t.ritual_finish}</Button>}
        </div>
      </div>
    </Modal>
  )
}
