'use client'

import type { Task } from '@lifeos/shared'
import { shouldAskStillImportant, todayDate, useTaskStore } from '@lifeos/shared'
import { supabase } from '@/lib/supabase/client'
import { useLang } from '@/lib/contexts/LangContext'
import { useToast } from '@/components/ui/Toast'

interface CarryoverListProps {
  tasks: Task[]
  onOpen: (task: Task) => void
  /** Liste değişti: günün verisini yeniden oku. */
  onChanged: () => void
}

/**
 * Dünden kalanlar: tarihi geçmiş bitmemiş görevler ve gece devrinin bugüne
 * taşıdıkları (carry_count > 0). Suçlayıcı renk yok: devretmek normal. Bir görev
 * CARRY_PROMPT_THRESHOLD kez devrettiyse tek bir soru sorulur.
 */
export function CarryoverList({ tasks, onOpen, onChanged }: CarryoverListProps) {
  const { t } = useLang()
  const { showToast } = useToast()
  const { setStatus, updateTask, deleteTask } = useTaskStore()

  if (tasks.length === 0) return null

  const run = async (p: Promise<unknown>, msg: string) => {
    try { await p; onChanged(); showToast(msg, 'success') }
    catch { showToast('Görev güncellenemedi', 'error') }
  }

  // "Bugün tut": kullanıcı önemini onayladı, sayaç sıfırlanır; üç devir daha olursa yine sorulur.
  const keepToday = (task: Task) =>
    void run(updateTask(supabase, task.id, { status: 'planned', scheduled_date: todayDate(), carry_count: 0 }), t.plan_keep_today)
  const toBacklog = (task: Task) =>
    void run(updateTask(supabase, task.id, { status: 'backlog', scheduled_date: null }), t.plan_to_backlog)

  return (
    <div className="glass rounded-2xl p-4">
      <h3 className="mb-3 text-sm font-semibold text-primary">{t.plan_carryover} ({tasks.length})</h3>
      <div className="space-y-1.5">
        {tasks.slice(0, 5).map((task) => (
          <div key={task.id} className="group rounded-xl border border-border/60 bg-background/60 px-3 py-2">
            <div className="flex items-center gap-2">
              <button onClick={() => onOpen(task)} className="flex-1 truncate text-left text-xs font-medium text-primary">
                {task.title}
              </button>
              {task.effort_score > 0 && (
                <span className="shrink-0 rounded-md bg-border/40 px-1.5 py-0.5 text-[10px] font-medium text-muted">{task.effort_score}h</span>
              )}
              <button onClick={() => void run(setStatus(supabase, task.id, 'done'), 'Görev tamamlandı ✓')}
                className="shrink-0 rounded-lg p-1 text-muted opacity-0 transition-all hover:bg-success/10 hover:text-success group-hover:opacity-100"
                title="Tamamla">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <button onClick={() => void run(setStatus(supabase, task.id, 'deferred'), 'Görev ertelendi')}
                className="shrink-0 rounded-lg p-1 text-muted opacity-0 transition-all hover:bg-border/40 hover:text-primary group-hover:opacity-100"
                title="Pass geç (ertele)">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            {shouldAskStillImportant(task) && (
              <div className="mt-2 border-t border-border/40 pt-2">
                <p className="mb-1.5 text-[10px] text-muted">{t.plan_still_important.replace('{n}', String(task.carry_count))}</p>
                <div className="flex gap-1.5">
                  <button onClick={() => keepToday(task)} className="rounded-lg bg-accent/10 px-2 py-1 text-[10px] font-medium text-accent hover:bg-accent/20">{t.plan_keep_today}</button>
                  <button onClick={() => toBacklog(task)} className="rounded-lg bg-border/40 px-2 py-1 text-[10px] font-medium text-muted hover:bg-border/60">{t.plan_to_backlog}</button>
                  <button onClick={() => void run(deleteTask(supabase, task.id), t.plan_delete)} className="rounded-lg px-2 py-1 text-[10px] font-medium text-muted hover:text-danger">{t.plan_delete}</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
