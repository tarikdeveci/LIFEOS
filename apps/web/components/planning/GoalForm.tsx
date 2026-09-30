'use client'

import { useState } from 'react'
import type { CreateGoalInput, Goal, GoalCountMode, GoalHorizon } from '@lifeos/shared'
import { useLang } from '@/lib/contexts/LangContext'

interface GoalFormProps {
  horizon: GoalHorizon
  periodStart: string
  /** Bir üst ufkun bu dönemdeki aktif hedefleri. */
  parents: Goal[]
  /** false dönerse kayıt başarısız: taslak korunur. */
  onSubmit: (input: CreateGoalInput) => Promise<boolean>
}

interface Draft {
  open: boolean
  title: string
  icon: string
  parentId: string
  countable: boolean
  target: number
  unit: string
  tags: string
  countMode: GoalCountMode
}

const EMPTY: Draft = {
  open: false, title: '', icon: '🎯', parentId: '', countable: true,
  target: 3, unit: 'gün', tags: '', countMode: 'tasks',
}

export function GoalForm({ horizon, periodStart, parents, onSubmit }: GoalFormProps) {
  const { t } = useLang()
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  // Sayılabilir hedef varsayılanı sadece haftada açık; ay ve çeyrek oranla ölçülür.
  const countable = horizon === 'week' ? draft.countable : false

  const submit = async () => {
    if (!draft.title.trim()) return
    const ok = await onSubmit({
      horizon,
      title: draft.title.trim(),
      icon: draft.icon || null,
      period_start: periodStart,
      parent_id: draft.parentId || null,
      target: countable ? draft.target : null,
      unit: countable ? draft.unit : null,
      count_mode: countable ? draft.countMode : null,
      tag_filter: countable ? draft.tags.split(',').map((x) => x.trim()).filter(Boolean) : [],
    })
    if (ok) setDraft(EMPTY)
  }

  if (!draft.open) {
    return (
      <button
        onClick={() => set({ open: true })}
        className="mt-3 w-full rounded-xl border border-dashed border-border py-2 text-xs font-medium text-accent hover:border-accent hover:bg-accent/5"
      >{t.plan_weekly_add_goal}</button>
    )
  }

  const inputCls = 'rounded-lg border border-border bg-surface px-2 py-1 text-xs text-primary'

  return (
    <div className="mt-3 space-y-2 rounded-xl bg-background p-3">
      <p className="text-[11px] font-medium text-primary">{t.plan_weekly_new_goal}</p>
      <div className="flex gap-2">
        <input value={draft.icon} onChange={(e) => set({ icon: e.target.value })} maxLength={2}
          className={`w-10 text-center text-sm ${inputCls}`} placeholder="🎯" />
        <input value={draft.title} onChange={(e) => set({ title: e.target.value })} maxLength={200}
          className={`flex-1 ${inputCls}`} placeholder={t.plan_weekly_goal_label} />
      </div>

      {parents.length > 0 && (
        <label className="flex items-center gap-2 text-[10px] text-muted">
          {t.goal_parent}
          <select value={draft.parentId} onChange={(e) => set({ parentId: e.target.value })} className={`flex-1 ${inputCls}`}>
            <option value="">{t.goal_none}</option>
            {parents.map((p) => <option key={p.id} value={p.id}>{p.icon ?? '🎯'} {p.title}</option>)}
          </select>
        </label>
      )}

      {horizon === 'week' && (
        <label className="flex items-center gap-2 text-[10px] text-muted">
          <input type="checkbox" checked={draft.countable} onChange={(e) => set({ countable: e.target.checked })} />
          {t.goal_countable}
        </label>
      )}

      {countable && (
        <>
          <div className="flex gap-2">
            <span className="flex items-center gap-1 text-[10px] text-muted">
              {t.plan_weekly_target}
              <input type="number" min={1} max={99} value={draft.target}
                onChange={(e) => set({ target: Math.max(1, parseInt(e.target.value) || 1) })}
                className={`w-12 text-center ${inputCls}`} />
            </span>
            <select value={draft.unit} onChange={(e) => set({ unit: e.target.value })} className={inputCls}>
              {['gün', 'saat', 'öğün', 'kez'].map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted">{t.plan_weekly_tags}</span>
            <input value={draft.tags} onChange={(e) => set({ tags: e.target.value })}
              className={`flex-1 ${inputCls}`} placeholder="spor, koşu" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted">{t.plan_weekly_count}</span>
            {(['tasks', 'hours'] as const).map((m) => (
              <button key={m} onClick={() => set({ countMode: m })}
                className={`rounded-lg px-2 py-0.5 text-[10px] font-medium ${draft.countMode === m ? 'bg-accent text-white' : 'bg-border/40 text-muted'}`}>
                {m === 'tasks' ? t.plan_weekly_count_tasks : t.plan_weekly_count_hours}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex gap-2">
        <button onClick={() => setDraft(EMPTY)}
          className="flex-1 rounded-lg border border-border py-1 text-[10px] text-muted hover:bg-border/30">
          {t.plan_weekly_cancel}
        </button>
        <button onClick={() => void submit()} disabled={!draft.title.trim()}
          className="flex-1 rounded-lg bg-accent py-1 text-[10px] font-medium text-white hover:bg-accent/90 disabled:opacity-40">
          {t.plan_weekly_add}
        </button>
      </div>
    </div>
  )
}
