'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Goal, GoalHorizon } from '@lifeos/shared'
import type { GoalTask } from '@lifeos/shared/supabase'
import {
  goalPeriodStart,
  goalTreeProgress,
  goalsNeedingReview,
  legacyWeeklyGoalsToInputs,
  todayDate,
  useGoalStore,
} from '@lifeos/shared'
import { supabase } from '@/lib/supabase/client'
import { useLang } from '@/lib/contexts/LangContext'
import { GoalReviewCard } from './GoalReviewCard'
import { GoalForm } from './GoalForm'
import { GoalProgressEntries } from './GoalProgressEntries'

interface GoalsPanelProps {
  userId: string
  /** Bir adım tiklendi ya da geri açıldı: aynı görevi gösteren gün görünümü yenilensin. */
  onStepToggle?: () => void
}

const HORIZONS: GoalHorizon[] = ['week', 'month', 'quarter']
const PARENT_OF: Record<GoalHorizon, GoalHorizon | null> = { week: 'month', month: 'quarter', quarter: null }

/** Çeyrek, ay ve hafta hedefleri. Eski localStorage haftalık hedeflerini bir kez DB'ye taşır. */
export function GoalsPanel({ userId, onStepToggle }: GoalsPanelProps) {
  const { t } = useLang()
  const {
    goals, tasks, entries, loading, error, fetchGoals, addGoal, importGoals, editGoal, removeGoal, reviewGoal,
    addStep, setStepDone,
  } = useGoalStore()
  const [tab, setTab] = useState<GoalHorizon>('week')
  const [editing, setEditing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const migrated = useRef(false)
  const today = todayDate()

  // Yükle, sonra localStorage `wgoals_<userId>` → goals (bir kez). Aktarım DB'deki hedefler
  // geldikten sonra yapılır: aynı başlık bu hafta varsa tekrar eklenmez.
  useEffect(() => {
    const load = async () => {
      await fetchGoals(supabase, userId)
      const state = useGoalStore.getState()
      if (state.error || migrated.current) return
      migrated.current = true
      const key = `wgoals_${userId}`
      let raw: unknown = null
      try { raw = JSON.parse(localStorage.getItem(key) ?? 'null') } catch { raw = null }
      if (raw === null) return
      const week = goalPeriodStart('week', todayDate())
      const existing = new Set(state.goals.filter((g) => g.horizon === 'week' && g.period_start === week).map((g) => g.title))
      const inputs = legacyWeeklyGoalsToInputs(raw, week).filter((i) => !existing.has(i.title))
      try {
        await importGoals(supabase, userId, inputs)
        localStorage.removeItem(key)
      } catch {
        migrated.current = false
      }
    }
    void load()
  }, [userId, fetchGoals, importGoals])

  const progress = useMemo(() => goalTreeProgress(goals, tasks, entries), [goals, tasks, entries])
  const period = goalPeriodStart(tab, today)
  const visible = goals.filter((g) => g.horizon === tab && g.period_start === period && g.status !== 'dropped')
  const parentHorizon = PARENT_OF[tab]
  const parents = parentHorizon
    ? goals.filter((g) => g.horizon === parentHorizon && g.status === 'active' && g.period_start === goalPeriodStart(parentHorizon, today))
    : []
  const toReview = goalsNeedingReview(goals, today)
  const overall = visible.length > 0
    ? Math.round(visible.reduce((s, g) => s + (progress.get(g.id)?.pct ?? 0), 0) / visible.length)
    : 0

  const run = async (fn: () => Promise<unknown>, failed: string = t.goal_error): Promise<boolean> => {
    setActionError(null)
    try { await fn(); return true } catch { setActionError(failed); return false }
  }

  const toggleStep = async (step: GoalTask) => {
    if (await run(() => setStepDone(supabase, step.id, step.status !== 'done'), t.goal_step_error)) onStepToggle?.()
  }

  if (loading && goals.length === 0) {
    return (
      <div className="glass rounded-2xl p-4">
        <div className="h-4 w-32 animate-pulse rounded bg-border/40" />
      </div>
    )
  }

  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold text-primary">
          🎯 {t.goal_title}
          <span className="text-[10px] text-muted">({overall}%)</span>
        </span>
        <button onClick={() => setEditing((e) => !e)} className="text-[10px] text-muted hover:text-accent">
          {editing ? t.plan_weekly_close : t.plan_weekly_edit}
        </button>
      </div>

      <GoalReviewCard
        goals={toReview}
        onReview={(goal, decision, note) => run(() => reviewGoal(supabase, userId, goal, decision, note))}
      />

      <div className="mb-3 flex gap-1 rounded-xl bg-border/30 p-0.5">
        {HORIZONS.map((h) => (
          <button
            key={h}
            onClick={() => setTab(h)}
            className={`flex-1 rounded-lg py-1 text-[11px] font-medium ${tab === h ? 'bg-surface text-primary shadow-sm' : 'text-muted'}`}
          >
            {h === 'week' ? t.goal_tab_week : h === 'month' ? t.goal_tab_month : t.goal_tab_quarter}
          </button>
        ))}
      </div>

      {(error || actionError) && <p className="mb-2 text-[11px] text-danger">{actionError ?? error}</p>}

      {visible.length === 0 && <p className="text-center text-[11px] text-muted">{t.goal_empty}</p>}

      <div className="space-y-3">
        {visible.map((goal) => (
          <GoalRow
            key={goal.id}
            goal={goal}
            userId={userId}
            pct={progress.get(goal.id)?.pct ?? 0}
            label={progressLabel(goal, progress.get(goal.id))}
            parentTitle={goals.find((p) => p.id === goal.parent_id)?.title ?? null}
            steps={tasks.filter((task) => task.goal_id === goal.id)}
            editing={editing}
            onToggleDone={() => run(() => editGoal(supabase, goal.id, { status: goal.status === 'done' ? 'active' : 'done' }))}
            onDelete={() => run(() => removeGoal(supabase, goal.id))}
            onAddStep={(title) => run(() => addStep(supabase, userId, goal.id, title), t.goal_step_error)}
            onToggleStep={(step) => void toggleStep(step)}
          />
        ))}
      </div>

      {editing && (
        <GoalForm
          key={tab}
          horizon={tab}
          periodStart={period}
          parents={parents}
          onSubmit={(input) => run(() => addGoal(supabase, userId, input))}
        />
      )}

      {tab !== 'week' && visible.length > 0 && (
        <p className="mt-2 text-center text-[10px] text-muted">{t.goal_ratio_hint}</p>
      )}
    </div>
  )
}

function progressLabel(goal: Goal, p: { current: number; total: number; pct: number } | undefined): string {
  if (!p) return ''
  if (goal.target != null) return `${p.current}/${p.total}${goal.unit ? ` ${goal.unit}` : ''}`
  return p.total > 0 ? `${p.current}/${p.total}` : `${p.pct}%`
}

interface GoalRowProps {
  userId: string
  goal: Goal
  pct: number
  label: string
  parentTitle: string | null
  /** Hedefe bağlı görevler, eklenme sırasıyla. */
  steps: GoalTask[]
  editing: boolean
  onToggleDone: () => void
  onDelete: () => void
  /** false dönerse kayıt başarısız: taslak korunur. */
  onAddStep: (title: string) => Promise<boolean>
  onToggleStep: (step: GoalTask) => void
}

function GoalRow({ userId, goal, pct, label, parentTitle, steps, editing, onToggleDone, onDelete, onAddStep, onToggleStep }: GoalRowProps) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const done = goal.status === 'done' || pct >= 100
  const stepsDone = steps.filter((s) => s.status === 'done').length

  const submitStep = async () => {
    const title = draft.trim()
    if (!title || saving) return
    setSaving(true)
    try {
      if (await onAddStep(title)) setDraft('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="flex min-w-0 items-center gap-1.5 font-medium text-primary">
          <span>{goal.icon ?? '🎯'}</span>
          <span className="truncate">{goal.title}</span>
          {done && <span className="text-success">✓</span>}
        </span>
        <span className={done ? 'font-bold text-success' : 'text-muted'}>{label}</span>
      </div>
      <div className="h-1.5 rounded-full bg-border/40">
        <div
          className={`h-1.5 rounded-full transition-all ${done ? 'bg-success' : 'bg-accent'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {parentTitle && <p className="mt-0.5 text-[10px] text-muted">↳ {parentTitle}</p>}
      <div className="mt-1 flex items-center gap-2">
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mr-auto text-[10px] text-muted hover:text-accent">
          {open ? '▾' : '▸'} {t.goal_steps}{steps.length > 0 && ` ${stepsDone}/${steps.length}`}
        </button>
        <button onClick={onToggleDone} className="text-[10px] text-accent hover:underline">
          {goal.status === 'done' ? t.goal_reopen : t.goal_mark_done}
        </button>
        {editing && <button onClick={onDelete} className="text-[10px] text-danger hover:underline">{t.goal_delete}</button>}
      </div>
      {goal.target != null && goal.count_mode && (
        <GoalProgressEntries goal={goal} userId={userId} expanded={open} />
      )}
      {open && (
        <div className="mt-1.5 space-y-1.5 rounded-xl bg-background p-2">
          {steps.length === 0 && <p className="text-[10px] text-muted">{t.goal_steps_empty}</p>}
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {steps.map((step) => (
              <label key={step.id} className="flex cursor-pointer items-start gap-2 text-[11px]">
                <input type="checkbox" checked={step.status === 'done'} onChange={() => onToggleStep(step)} className="mt-0.5" />
                <span className={step.status === 'done' ? 'text-muted line-through' : 'text-primary'}>{step.title}</span>
              </label>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void submitStep() }} className="flex gap-1.5">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={200} placeholder={t.goal_step_placeholder}
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-[11px] text-primary" />
            <button type="submit" disabled={saving || !draft.trim()}
              className="rounded-lg bg-accent px-2 py-1 text-[10px] font-medium text-white hover:bg-accent/90 disabled:opacity-40">
              {t.plan_weekly_add}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
