'use client'

import { todayDate, habitWeekProgress, useRoutineStore } from '@lifeos/shared'
import { supabase } from '@/lib/supabase/client'
import { useLang } from '@/lib/contexts/LangContext'
import { useToast } from '@/components/ui/Toast'

interface HabitsTodayProps { userId: string }

/** "Haftada N kez" alışkanlıkları: bugünü işaretle, haftalık ilerlemeyi gör. Kaçırılan gün cezalandırılmaz. */
export function HabitsToday({ userId }: HabitsTodayProps) {
  const { t } = useLang()
  const { showToast } = useToast()
  const { routines, completions, toggleHabit } = useRoutineStore()
  const today = todayDate()
  const habits = routines.filter((r) => r.kind === 'habit' && r.is_active)
  if (habits.length === 0) return null

  return (
    <div className="glass rounded-2xl p-4">
      <h3 className="mb-3 text-sm font-semibold text-primary">{t.habits_title}</h3>
      <div className="space-y-1.5">
        {habits.map((h) => {
          const days = completions.filter((c) => c.routine_id === h.id).map((c) => c.completed_on)
          const doneToday = days.includes(today)
          const progress = habitWeekProgress(days, h.times_per_week ?? 1, today)
          return (
            <label key={h.id} className="flex cursor-pointer items-center gap-2 rounded-xl bg-background/60 px-3 py-2">
              <input type="checkbox" checked={doneToday} className="rounded"
                onChange={(e) => {
                  toggleHabit(supabase, userId, h.id, today, e.target.checked)
                    .catch(() => showToast(t.plan_routine_error, 'error'))
                }} />
              <span className="flex-1 truncate text-xs font-medium text-primary">{h.title}</span>
              <span className={`shrink-0 text-[10px] font-medium ${progress.met ? 'text-success' : 'text-muted'}`}>
                {t.habits_progress.replace('{done}', String(progress.done)).replace('{target}', String(progress.target))}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
