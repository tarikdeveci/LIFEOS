'use client'

import { useEffect } from 'react'
import type { GoalHorizon } from '@lifeos/shared'
import { goalPeriodStart, todayDate, useGoalStore } from '@lifeos/shared'
import { useLang } from '@/lib/contexts/LangContext'
import { supabase } from '@/lib/supabase/client'

interface TaskGoalSelectProps {
  userId: string
  goalId: string | null
  onChange: (goalId: string | null) => void
}

const GROUPS: { horizon: GoalHorizon; labelKey: 'goal_group_week' | 'goal_group_month' | 'goal_group_quarter' }[] = [
  { horizon: 'week', labelKey: 'goal_group_week' },
  { horizon: 'month', labelKey: 'goal_group_month' },
  { horizon: 'quarter', labelKey: 'goal_group_quarter' },
]

/** Görevi bu dönemin aktif hedeflerinden birine bağlar; bağlanınca değer puanı en az 4 olur. */
export function TaskGoalSelect({ userId, goalId, onChange }: TaskGoalSelectProps) {
  const { t } = useLang()
  const { goals, loading, fetchGoals } = useGoalStore()

  useEffect(() => {
    if (goals.length === 0 && !loading) void fetchGoals(supabase, userId)
    // Sadece açılışta; boş liste her render'da yeniden istek atmasın.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const today = todayDate()
  const current = goals.find((g) => g.id === goalId)

  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{t.goal_select_label}</span>
      <select
        value={goalId ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-primary"
      >
        <option value="">{t.goal_select_none}</option>
        {current && (current.status !== 'active' || current.period_start !== goalPeriodStart(current.horizon, today)) && (
          <option value={current.id}>{current.icon ?? '🎯'} {current.title}</option>
        )}
        {GROUPS.map(({ horizon, labelKey }) => {
          const options = goals.filter((g) =>
            g.horizon === horizon && g.status === 'active' && g.period_start === goalPeriodStart(horizon, today),
          )
          if (options.length === 0) return null
          return (
            <optgroup key={horizon} label={t[labelKey]}>
              {options.map((g) => <option key={g.id} value={g.id}>{g.icon ?? '🎯'} {g.title}</option>)}
            </optgroup>
          )
        })}
      </select>
    </label>
  )
}
