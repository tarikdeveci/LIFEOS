'use client'

import { useState } from 'react'
import type { CreateRoutineInput, Routine } from '@lifeos/shared'
import { BLOCK_TYPE_COLORS, useRoutineStore } from '@lifeos/shared'
import { supabase } from '@/lib/supabase/client'
import { useLang } from '@/lib/contexts/LangContext'
import { useToast } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { RoutineFormModal } from '@/components/planning/RoutineFormModal'
import { WEEKDAY_ORDER } from '@/components/planning/RecurrencePicker'

interface WeeklyRoutinesProps {
  userId: string
  /** Seri değişti: takvimdeki örnekleri yeniden okumak için. */
  onChanged: () => void
}

/** "Haftam": rutin şablonları 7 sütunda. Örnekleri sunucu üretir, burası sadece şablonu düzenler. */
export function WeeklyRoutines({ userId, onChanged }: WeeklyRoutinesProps) {
  const { t } = useLang()
  const { showToast } = useToast()
  const { routines, loading, addRoutine, updateSeries, removeRoutine } = useRoutineStore()
  const [editing, setEditing] = useState<Routine | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const names = t.routines_day_names.split(',')
  const scheduled = routines.filter((r) => r.kind !== 'habit' && r.is_active)
  const habits = routines.filter((r) => r.kind === 'habit' && r.is_active)

  const open = (r: Routine | null) => { setEditing(r); setFormOpen(true) }

  const handleSave = async (input: CreateRoutineInput) => {
    if (editing) await updateSeries(supabase, editing.id, input)
    else await addRoutine(supabase, userId, input)
    showToast(editing ? t.plan_routine_updated : t.plan_routine_added, 'success')
    onChanged()
  }

  const handleDelete = async () => {
    if (!editing) return
    await removeRoutine(supabase, editing.id)
    showToast(t.plan_routine_deleted, 'success')
    onChanged()
  }

  return (
    <div className="glass mt-4 rounded-2xl p-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-primary">{t.routines_title}</h3>
          <p className="text-xs text-muted">{t.routines_subtitle}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => open(null)}>{t.routines_add}</Button>
      </div>

      {!loading && routines.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted">{t.routines_empty}</p>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {WEEKDAY_ORDER.map((d) => (
            <div key={d} className="min-h-[80px] rounded-xl bg-background/60 p-1.5">
              <p className="mb-1 text-center text-[10px] font-semibold uppercase text-muted">{names[d]}</p>
              <div className="space-y-1">
                {scheduled.filter((r) => r.days_of_week.includes(d)).map((r) => (
                  <button key={r.id} onClick={() => open(r)}
                    className="w-full rounded-lg px-1.5 py-1 text-left text-[10px] leading-tight hover:opacity-80"
                    style={{ backgroundColor: `${r.color ?? BLOCK_TYPE_COLORS[r.block_type]}20`, color: r.color ?? BLOCK_TYPE_COLORS[r.block_type] }}>
                    <span className="block truncate font-semibold">{r.title}</span>
                    {r.start_time && <span className="opacity-80">{r.start_time.slice(0, 5)}</span>}
                    {r.every_n_weeks > 1 && <span className="opacity-80"> · {t.routines_biweekly}</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {habits.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-semibold text-primary">{t.routines_habits}</p>
          <div className="flex flex-wrap gap-2">
            {habits.map((r) => (
              <button key={r.id} onClick={() => open(r)}
                className="rounded-lg bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/20">
                {r.title} · {t.routines_habit_target.replace('{n}', String(r.times_per_week ?? 1))}
              </button>
            ))}
          </div>
        </div>
      )}

      <RoutineFormModal open={formOpen} routine={editing}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
        onDelete={editing ? handleDelete : undefined} />
    </div>
  )
}
