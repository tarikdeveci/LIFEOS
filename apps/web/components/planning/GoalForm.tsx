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
  target: 3, unit: '', tags: '', countMode: 'tasks',
}

export function GoalForm({ horizon, periodStart, parents, onSubmit }: GoalFormProps) {
  const { t } = useLang()
  const empty = { ...EMPTY, countable: horizon === 'week' }
  const [draft, setDraft] = useState<Draft>(empty)
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  // Ay ve çeyrek de istenirse miktarla ölçülebilir.
  const countable = draft.countable
  // Sekme değişince önceki ufkun üst hedefi listede yoksa seçim boşa düşer.
  const parentId = parents.some((p) => p.id === draft.parentId) ? draft.parentId : ''
  // Birim, seçili dilde yazılıp öyle saklanır; dil değişirse ilk seçeneğe döner.
  const units = [t.goal_unit_day, t.goal_unit_hour, t.goal_unit_meal, t.goal_unit_time]
  const unit = draft.countMode === 'units' ? draft.unit.trim() : units.includes(draft.unit) ? draft.unit : units[0]!

  // Miktar pozitif olmalı; elle kaydedilen hedefte birim de yazılmalı.
  const invalid = countable && (!Number.isFinite(draft.target) || draft.target <= 0 || (draft.countMode === 'units' && !unit))

  const submit = async () => {
    if (saving || !draft.title.trim() || invalid) return
    setSaving(true)
    try {
      const ok = await onSubmit({
        horizon,
        title: draft.title.trim(),
        icon: draft.icon || null,
        period_start: periodStart,
        parent_id: parentId || null,
        target: countable ? draft.target : null,
        unit: countable ? unit : null,
        count_mode: countable ? draft.countMode : null,
        tag_filter: countable && draft.countMode !== 'units' ? draft.tags.split(',').map((x) => x.trim()).filter(Boolean) : [],
      })
      if (ok) setDraft(empty)
    } finally {
      setSaving(false)
    }
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
          <select value={parentId} onChange={(e) => set({ parentId: e.target.value })} className={`flex-1 ${inputCls}`}>
            <option value="">{t.goal_none}</option>
            {parents.map((p) => <option key={p.id} value={p.id}>{p.icon ?? '🎯'} {p.title}</option>)}
          </select>
        </label>
      )}

      <label className="flex items-center gap-2 text-[10px] text-muted">
          <input type="checkbox" checked={draft.countable} onChange={(e) => set({ countable: e.target.checked })} />
          {t.goal_countable}
      </label>

      {countable && (
        <>
          <div className="flex gap-2">
            <span className="flex items-center gap-1 text-[10px] text-muted">
              {t.plan_weekly_target}
              <input type="number" min={0.001} max={100000} step="any" value={draft.target}
                onChange={(e) => set({ target: Number(e.target.value) })}
                className={`w-12 text-center ${inputCls}`} />
            </span>
            {draft.countMode === 'units' ? (
              <input value={draft.unit} onChange={(e) => set({ unit: e.target.value })} maxLength={20}
                aria-label={t.goal_unit_custom} placeholder={t.goal_unit_custom} className={`min-w-0 flex-1 ${inputCls}`} />
            ) : <select value={unit} onChange={(e) => set({ unit: e.target.value })} className={inputCls}>
              {units.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>}
          </div>
          {/* Elle kaydedilen hedefte görev sayılmaz; etiket alanı gereksiz. */}
          {draft.countMode !== 'units' && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted">{t.plan_weekly_tags}</span>
              <input value={draft.tags} onChange={(e) => set({ tags: e.target.value })}
                className={`flex-1 ${inputCls}`} placeholder={t.goal_tags_placeholder} />
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted">{t.plan_weekly_count}</span>
            {(['tasks', 'hours', 'units'] as const).map((m) => (
              <button key={m} onClick={() => set({ countMode: m })}
                className={`rounded-lg px-2 py-0.5 text-[10px] font-medium ${draft.countMode === m ? 'bg-accent text-white' : 'bg-border/40 text-muted'}`}>
                {m === 'tasks' ? t.plan_weekly_count_tasks : m === 'hours' ? t.plan_weekly_count_hours : t.goal_count_units}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex gap-2">
        <button onClick={() => setDraft(empty)}
          className="flex-1 rounded-lg border border-border py-1 text-[10px] text-muted hover:bg-border/30">
          {t.plan_weekly_cancel}
        </button>
        <button onClick={() => void submit()} disabled={saving || !draft.title.trim() || invalid}
          className="flex-1 rounded-lg bg-accent py-1 text-[10px] font-medium text-white hover:bg-accent/90 disabled:opacity-40">
          {t.plan_weekly_add}
        </button>
      </div>
    </div>
  )
}
