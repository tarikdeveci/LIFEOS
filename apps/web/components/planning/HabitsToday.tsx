'use client'

import { useState } from 'react'
import type { CreateRoutineInput, Routine } from '@lifeos/shared'
import { todayDate, habitDoneDays, habitWeekProgress, isRoutineActiveOn, useRoutineStore } from '@lifeos/shared'
import { supabase } from '@/lib/supabase/client'
import { useLang } from '@/lib/contexts/LangContext'
import { useToast } from '@/components/ui/Toast'
import { RoutineFormModal } from '@/components/planning/RoutineFormModal'

interface HabitsTodayProps { userId: string }

/**
 * Bugünün alışkanlıkları. "Günde N kez" satırında sayaç ve -/+ düğmeleri, "haftada N gün"
 * satırında bugünün işareti ve haftanın sayısı. Kaçırılan gün cezalandırılmaz.
 * Alışkanlık yokken ekleme daveti görünür; ekleme Haftam'a gömülü kalmasın.
 */
export function HabitsToday({ userId }: HabitsTodayProps) {
  const { t } = useLang()
  const { showToast } = useToast()
  const { routines, completions, setHabitCount, addRoutine, updateSeries, removeRoutine } = useRoutineStore()
  const [editing, setEditing] = useState<Routine | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const today = todayDate()
  const habits = routines.filter((r) => r.kind === 'habit' && isRoutineActiveOn(r, today))

  const write = (routineId: string, count: number) => {
    setHabitCount(supabase, userId, routineId, today, count).catch(() => showToast(t.plan_routine_error, 'error'))
  }
  const openForm = (routine: Routine | null) => { setEditing(routine); setFormOpen(true) }
  const handleSave = async (input: CreateRoutineInput) => {
    if (editing) await updateSeries(supabase, editing.id, input)
    else await addRoutine(supabase, userId, input)
  }

  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-primary">{t.habits_title}</h3>
        {habits.length > 0 && (
          <button onClick={() => openForm(null)} className="text-xs font-semibold text-accent hover:underline">+ {t.habits_add}</button>
        )}
      </div>

      {habits.length === 0 ? (
        <button onClick={() => openForm(null)}
          className="w-full rounded-xl border border-dashed border-border px-3 py-3 text-left transition-colors hover:border-accent">
          <span className="block text-xs font-semibold text-accent">+ {t.habits_add}</span>
          <span className="mt-0.5 block text-[11px] text-muted">{t.habits_empty_hint}</span>
        </button>
      ) : (
        <div className="space-y-1.5">
          {habits.map((h) => {
            const own = completions.filter((c) => c.routine_id === h.id)
            const count = own.find((c) => c.completed_on === today)?.count ?? 0
            const perDay = h.times_per_day
            const doneToday = count >= (perDay ?? 1)
            const week = habitWeekProgress(habitDoneDays(own, perDay), h.times_per_week ?? 1, today)
            return (
              <div key={h.id} className="flex items-center gap-2 rounded-xl bg-background/60 px-3 py-2">
                {perDay === null && (
                  <input type="checkbox" checked={doneToday} className="rounded" aria-label={h.title}
                    onChange={(e) => write(h.id, e.target.checked ? 1 : 0)} />
                )}
                <button onClick={() => openForm(h)} className="flex-1 truncate text-left text-xs font-medium text-primary hover:text-accent">
                  {h.title}
                </button>
                <span className={`shrink-0 text-[10px] font-medium tabular-nums ${doneToday || week.met ? 'text-success' : 'text-muted'}`}>
                  {perDay
                    ? t.habits_today.replace('{done}', String(count)).replace('{target}', String(perDay))
                    : t.habits_progress.replace('{done}', String(week.done)).replace('{target}', String(week.target))}
                </span>
                {perDay !== null && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => write(h.id, count - 1)} disabled={count === 0} aria-label="-1"
                      className="h-6 w-6 rounded-lg bg-surface text-xs font-bold text-muted hover:text-primary disabled:opacity-30">−</button>
                    <button onClick={() => write(h.id, count + 1)} aria-label="+1"
                      className={`h-6 w-6 rounded-lg text-xs font-bold ${doneToday ? 'bg-success/15 text-success' : 'bg-accent/10 text-accent hover:bg-accent/20'}`}>+</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <RoutineFormModal userId={userId} open={formOpen} routine={editing} defaultKind="habit"
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
        onDelete={editing ? () => removeRoutine(supabase, editing.id) : undefined} />
    </div>
  )
}
