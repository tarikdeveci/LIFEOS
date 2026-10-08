'use client'

import { useState } from 'react'
import { useGoalStore, type Goal } from '@lifeos/shared'
import { useLang } from '@/lib/contexts/LangContext'
import { supabase } from '@/lib/supabase/client'

interface GoalProgressEntriesProps {
  goal: Goal
  userId: string
  expanded: boolean
}

export function GoalProgressEntries({ goal, userId, expanded }: GoalProgressEntriesProps) {
  const { t } = useLang()
  const { entries, logProgress, removeEntry } = useGoalStore()
  const [draft, setDraft] = useState({ open: false, amount: '1' })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recent = entries.filter((e) => e.goal_id === goal.id)
    .sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.created_at.localeCompare(a.created_at))
  const amount = Number(draft.amount.replace(',', '.'))
  const valid = Number.isFinite(amount) && amount > 0 && amount <= 100000

  const save = async () => {
    if (busy) return
    if (!valid) { setError(t.goal_progress_invalid); return }
    setBusy('save')
    setError(null)
    try {
      await logProgress(supabase, userId, goal.id, amount)
      setDraft({ open: false, amount: '1' })
    } catch { setError(t.goal_progress_error) } finally { setBusy(null) }
  }

  const remove = async (id: string) => {
    if (busy) return
    setBusy(id)
    setError(null)
    try { await removeEntry(supabase, id) } catch { setError(t.goal_progress_error) } finally { setBusy(null) }
  }

  return (
    <div className="mt-1 space-y-1.5 text-[11px]">
      <button type="button" aria-label={t.goal_log_progress} aria-expanded={draft.open}
        onClick={() => setDraft((d) => ({ ...d, open: !d.open }))} className="text-accent">
        + {t.goal_log_progress}
      </button>
      {draft.open && (
        <form onSubmit={(e) => { e.preventDefault(); void save() }} className="flex items-center gap-2">
          <input type="number" inputMode="decimal" step="any" min={0} max={100000} required
            aria-label={t.goal_progress_amount} value={draft.amount} disabled={busy !== null}
            onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
            className="w-20 rounded-lg border border-border bg-surface px-2 py-1 text-primary" />
          <span className="text-muted">{goal.unit}</span>
          <button type="submit" disabled={busy !== null || !valid}
            className="rounded-lg bg-accent px-2 py-1 text-white disabled:opacity-40">
            {busy === 'save' ? '...' : t.goal_progress_save}
          </button>
        </form>
      )}
      {error && <p role="alert" className="text-danger">{error}</p>}
      {expanded && (
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-background p-2">
          <p className="text-muted">{t.goal_progress_entries}</p>
          {recent.length === 0 && <p className="text-muted">{t.goal_progress_empty}</p>}
          {recent.map((entry) => (
            <div key={entry.id} className="flex items-center gap-2 text-primary">
              <time dateTime={entry.entry_date}>{entry.entry_date}</time>
              <span className="flex-1">+{entry.amount} {goal.unit}</span>
              <button type="button" disabled={busy !== null || entry.id.startsWith('pending-')}
                aria-label={`${t.goal_progress_remove}: ${entry.entry_date}, ${entry.amount} ${goal.unit ?? ''}`}
                onClick={() => void remove(entry.id)} className="text-danger disabled:opacity-40">
                {busy === entry.id ? '...' : t.goal_progress_remove}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
