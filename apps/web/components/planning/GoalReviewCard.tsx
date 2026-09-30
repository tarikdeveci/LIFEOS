'use client'

import { useState } from 'react'
import type { Goal, GoalReviewDecision } from '@lifeos/shared'
import { useLang } from '@/lib/contexts/LangContext'

interface GoalReviewCardProps {
  goals: Goal[]
  onReview: (goal: Goal, decision: GoalReviewDecision, note: string) => Promise<unknown>
}

/** Ay değişince geçen ayın aktif hedefleri: Tamamlandı / Bıraktım / Bu aya taşı. */
export function GoalReviewCard({ goals, onReview }: GoalReviewCardProps) {
  const { t } = useLang()
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  if (goals.length === 0) return null

  const decide = async (goal: Goal, decision: GoalReviewDecision) => {
    setBusyId(goal.id)
    try {
      await onReview(goal, decision, notes[goal.id] ?? '')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mb-3 space-y-2 rounded-xl border border-accent/30 bg-accent/5 p-3">
      <p className="text-[11px] font-semibold text-primary">{t.goal_review_title}</p>
      {goals.map((goal) => (
        <div key={goal.id} className="space-y-1.5">
          <p className="text-xs font-medium text-primary">
            {goal.icon ?? '🎯'} {goal.title}
          </p>
          <input
            value={notes[goal.id] ?? ''}
            onChange={(e) => setNotes((n) => ({ ...n, [goal.id]: e.target.value }))}
            placeholder={t.goal_review_note}
            maxLength={2000}
            className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs text-primary"
          />
          <div className="flex gap-1.5">
            {([
              ['done', t.goal_review_done],
              ['dropped', t.goal_review_drop],
              ['carry', t.goal_review_carry],
            ] as const).map(([decision, label]) => (
              <button
                key={decision}
                disabled={busyId === goal.id}
                onClick={() => void decide(goal, decision)}
                className="flex-1 rounded-lg border border-border py-1 text-[10px] font-medium text-primary hover:bg-border/30 disabled:opacity-40"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
