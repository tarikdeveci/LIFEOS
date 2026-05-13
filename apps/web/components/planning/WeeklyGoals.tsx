'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { todayDate, shiftIsoDate } from '@lifeos/shared'
import { useLang } from '@/lib/contexts/LangContext'

interface WeeklyGoal {
  id: string
  label: string
  icon: string
  target: number
  unit: string
  tagFilter: string[]
  countMode: 'tasks' | 'hours'
}

const DEFAULT_GOALS: WeeklyGoal[] = [
  { id: 'sport',    label: 'Spor',               icon: '💪', target: 4,  unit: 'gün',  tagFilter: ['spor'],    countMode: 'tasks' },
  { id: 'dev',      label: 'Yazılım Geliştirme', icon: '💻', target: 8,  unit: 'saat', tagFilter: ['yazılım'], countMode: 'hours' },
]

interface GoalProgress extends WeeklyGoal { current: number; pct: number }
interface WeeklyGoalsProps { userId: string }

export function WeeklyGoals({ userId }: WeeklyGoalsProps) {
  const { t } = useLang()
  const [goals, setGoals] = useState<GoalProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [customGoals, setCustomGoals] = useState<WeeklyGoal[]>(() => {
    try { return JSON.parse(localStorage.getItem(`wgoals_${userId}`) ?? 'null') ?? DEFAULT_GOALS }
    catch { return DEFAULT_GOALS }
  })

  const [showAddForm, setShowAddForm] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newIcon, setNewIcon] = useState('🎯')
  const [newTarget, setNewTarget] = useState(3)
  const [newUnit, setNewUnit] = useState('gün')
  const [newTags, setNewTags] = useState('')
  const [newCountMode, setNewCountMode] = useState<'tasks' | 'hours'>('tasks')

  const weekStart = (() => {
    const d = new Date(todayDate())
    const dow = d.getDay()
    d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
    return d.toISOString().split('T')[0]!
  })()
  const weekEnd = shiftIsoDate(weekStart, 6)

  const fetchProgress = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('tasks').select('tags, status, estimated_minutes')
        .eq('user_id', userId).eq('status', 'done')
        .gte('scheduled_date', weekStart).lte('scheduled_date', weekEnd)

      const doneTasks = data ?? []
      setGoals(customGoals.map((goal) => {
        const matching = doneTasks.filter((task) =>
          goal.tagFilter.some((tag) => (task.tags as string[] ?? []).includes(tag))
        )
        const current = goal.countMode === 'tasks'
          ? matching.length
          : Math.round(matching.reduce((s, task) => s + (task.estimated_minutes ?? 60), 0) / 60)
        return { ...goal, current, pct: Math.min((current / goal.target) * 100, 100) }
      }))
    } finally { setLoading(false) }
  }, [userId, weekStart, weekEnd, customGoals])

  useEffect(() => { void fetchProgress() }, [fetchProgress])

  const saveCustomGoals = (updated: WeeklyGoal[]) => {
    setCustomGoals(updated)
    localStorage.setItem(`wgoals_${userId}`, JSON.stringify(updated))
  }

  const overallPct = goals.length > 0
    ? Math.round(goals.reduce((s, g) => s + g.pct, 0) / goals.length)
    : 0

  if (loading) {
    return (
      <div className="glass rounded-2xl p-4">
        <div className="h-4 w-32 animate-pulse rounded bg-border/40" />
      </div>
    )
  }

  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 text-sm font-semibold text-primary"
        >
          <span>🎯 {t.plan_weekly_goals}</span>
          <span className="text-[10px] text-muted">({overallPct}%)</span>
          <span className="text-xs text-muted">{collapsed ? '▸' : '▾'}</span>
        </button>
        <button
          onClick={() => { setEditing((e) => !e); setShowAddForm(false) }}
          className="text-[10px] text-muted hover:text-accent"
        >
          {editing ? t.plan_weekly_close : t.plan_weekly_edit}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="mb-3 h-1.5 rounded-full bg-border/40">
            <div
              className="h-1.5 rounded-full bg-gradient-to-r from-accent to-success transition-all"
              style={{ width: `${overallPct}%` }}
            />
          </div>

          <div className="space-y-3">
            {goals.map((goal) => {
              const done = goal.current >= goal.target
              return (
                <div key={goal.id}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-primary">
                      <span>{goal.icon}</span>
                      {goal.label}
                      {done && <span className="text-success">✓</span>}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={done ? 'font-bold text-success' : 'text-muted'}>
                        {goal.current}/{goal.target} {goal.unit}
                      </span>
                      {editing && (
                        <button
                          onClick={() => saveCustomGoals(customGoals.filter((g) => g.id !== goal.id))}
                          className="rounded px-1 py-0.5 text-[10px] text-danger hover:bg-danger/10"
                        >✕</button>
                      )}
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-border/40">
                    <div
                      className={`h-1.5 rounded-full transition-all ${done ? 'bg-success' : 'bg-accent'}`}
                      style={{ width: `${goal.pct}%` }}
                    />
                  </div>
                  {editing && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-[10px] text-muted">{t.plan_weekly_target}</span>
                      <input
                        type="number" min={1} max={99} value={goal.target}
                        onChange={(e) => saveCustomGoals(customGoals.map((g) =>
                          g.id === goal.id ? { ...g, target: parseInt(e.target.value) || 1 } : g
                        ))}
                        className="w-14 rounded-lg border border-border px-2 py-0.5 text-center text-xs bg-surface text-primary"
                      />
                      <span className="text-[10px] text-muted">{goal.unit}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {editing && (
            <div className="mt-3 border-t border-border/60 pt-3">
              {!showAddForm ? (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="w-full rounded-xl border border-dashed border-border py-2 text-xs font-medium text-accent hover:border-accent hover:bg-accent/5"
                >{t.plan_weekly_add_goal}</button>
              ) : (
                <div className="space-y-2 rounded-xl bg-background p-3">
                  <p className="text-[11px] font-medium text-primary">{t.plan_weekly_new_goal}</p>
                  <div className="flex gap-2">
                    <input
                      value={newIcon} onChange={(e) => setNewIcon(e.target.value)}
                      className="w-10 rounded-lg border border-border bg-surface px-1 py-1 text-center text-sm"
                      placeholder="🎯" maxLength={2}
                    />
                    <input
                      value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
                      className="flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-primary"
                      placeholder={t.plan_weekly_goal_label}
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted">{t.plan_weekly_target}</span>
                      <input
                        type="number" min={1} max={99} value={newTarget}
                        onChange={(e) => setNewTarget(parseInt(e.target.value) || 1)}
                        className="w-12 rounded-lg border border-border bg-surface px-1 py-1 text-center text-xs text-primary"
                      />
                    </div>
                    <select
                      value={newUnit} onChange={(e) => setNewUnit(e.target.value)}
                      className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-primary"
                    >
                      {['gün', 'saat', 'öğün', 'kez'].map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted">{t.plan_weekly_tags}</span>
                    <input
                      value={newTags} onChange={(e) => setNewTags(e.target.value)}
                      className="flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-primary"
                      placeholder="spor, koşu"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted">{t.plan_weekly_count}</span>
                    {(['tasks', 'hours'] as const).map((m) => (
                      <button key={m} onClick={() => setNewCountMode(m)}
                        className={`rounded-lg px-2 py-0.5 text-[10px] font-medium ${newCountMode === m ? 'bg-accent text-white' : 'bg-border/40 text-muted'}`}>
                        {m === 'tasks' ? t.plan_weekly_count_tasks : t.plan_weekly_count_hours}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setShowAddForm(false)}
                      className="flex-1 rounded-lg border border-border py-1 text-[10px] text-muted hover:bg-border/30">
                      {t.plan_weekly_cancel}
                    </button>
                    <button
                      onClick={() => {
                        if (!newLabel.trim()) return
                        saveCustomGoals([...customGoals, {
                          id: `goal_${Date.now()}`, label: newLabel.trim(), icon: newIcon,
                          target: newTarget, unit: newUnit,
                          tagFilter: newTags.split(',').map((tag) => tag.trim()).filter(Boolean),
                          countMode: newCountMode,
                        }])
                        setNewLabel(''); setNewIcon('🎯'); setNewTarget(3); setNewUnit('gün')
                        setNewTags(''); setNewCountMode('tasks'); setShowAddForm(false)
                      }}
                      disabled={!newLabel.trim()}
                      className="flex-1 rounded-lg bg-accent py-1 text-[10px] font-medium text-white hover:bg-accent/90 disabled:opacity-40">
                      {t.plan_weekly_add}
                    </button>
                  </div>
                </div>
              )}
              <button
                onClick={() => void fetchProgress()}
                className="mt-2 text-[10px] font-medium text-accent hover:underline"
              >{t.plan_weekly_refresh}</button>
            </div>
          )}

          {goals.every((g) => g.current === 0) && (
            <p className="mt-2 text-center text-[10px] text-muted">
              {t.plan_weekly_mark_hint}
            </p>
          )}
        </>
      )}
    </div>
  )
}
