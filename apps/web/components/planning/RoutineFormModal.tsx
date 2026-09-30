'use client'

import { useEffect, useState } from 'react'
import type { BlockType, CreateRoutineInput, Routine, RoutineKind, Weekday } from '@lifeos/shared'
import { BLOCK_TYPE_LABELS, todayDate } from '@lifeos/shared'
import { useLang } from '@/lib/contexts/LangContext'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { DayToggles } from '@/components/planning/RecurrencePicker'

interface RoutineFormModalProps {
  open: boolean
  /** null = yeni rutin */
  routine: Routine | null
  onClose: () => void
  onSave: (input: CreateRoutineInput) => Promise<void>
  onDelete?: () => Promise<void>
  /** Yeni rutinde seçili gelen tür (alışkanlık kartından açılınca 'habit'). */
  defaultKind?: RoutineKind
}

interface FormState {
  title: string
  kind: RoutineKind
  blockType: BlockType
  days: Weekday[]
  biweekly: boolean
  /** Alışkanlık hedefi: günde N kez ya da haftada N gün. */
  habitMode: 'daily' | 'weekly'
  timesPerWeek: number
  timesPerDay: number
  start: string
  end: string
  endsOn: string
}

function toForm(r: Routine | null, defaultKind: RoutineKind): FormState {
  return {
    title: r?.title ?? '',
    kind: r?.kind ?? defaultKind,
    blockType: r?.block_type ?? 'focus',
    days: r?.days_of_week ?? [new Date().getDay() as Weekday],
    biweekly: (r?.every_n_weeks ?? 1) === 2,
    habitMode: r && r.kind === 'habit' && r.times_per_day === null && r.times_per_week !== 7 ? 'weekly' : 'daily',
    timesPerWeek: r?.times_per_week ?? 3,
    timesPerDay: r?.times_per_day ?? 1,
    start: r?.start_time?.slice(0, 5) ?? (r ? '' : '09:00'),
    end: r?.end_time?.slice(0, 5) ?? (r ? '' : '10:00'),
    endsOn: r?.ends_on ?? '',
  }
}

/** Formu doğrular; hata varsa mesaj, yoksa kayda hazır girdi döner. */
function toInput(f: FormState, isNew: boolean): CreateRoutineInput | string {
  const title = f.title.trim()
  if (!title) return 'Ad gerekli'
  if (f.kind === 'habit') {
    // Her gün: hafta hedefi 7 gün, gün sayaç N'ye ulaşınca tamam (1 = tek işaret).
    return f.habitMode === 'weekly'
      ? { title, kind: 'habit', days_of_week: [], times_per_week: f.timesPerWeek, times_per_day: null, ends_on: f.endsOn || null }
      : { title, kind: 'habit', days_of_week: [], times_per_week: 7, times_per_day: f.timesPerDay > 1 ? f.timesPerDay : null, ends_on: f.endsOn || null }
  }
  if (f.days.length === 0) return 'En az bir gün seç'
  const hasTime = f.start !== '' && f.end !== ''
  if (f.kind === 'block' && !hasTime) return 'Saat gerekli'
  if (hasTime && f.end <= f.start) return 'Bitiş saati başlangıçtan sonra olmalı'
  return {
    title,
    kind: f.kind,
    block_type: f.kind === 'block' ? f.blockType : 'task',
    days_of_week: [...f.days].sort(),
    every_n_weeks: f.biweekly ? 2 : 1,
    ...(hasTime && { start_time: f.start, end_time: f.end }),
    // İki haftalık parite starts_on'un haftasına çapalı: yeni rutinde bu hafta başlar,
    // düzenlemede eski çapa korunur ki seri bir hafta kaymasın.
    ...(isNew && { starts_on: todayDate() }),
    ends_on: f.endsOn || null,
  }
}

export function RoutineFormModal({ open, routine, onClose, onSave, onDelete, defaultKind = 'block' }: RoutineFormModalProps) {
  const { t } = useLang()
  const [form, setForm] = useState<FormState>(() => toForm(routine, defaultKind))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) { setForm(toForm(routine, defaultKind)); setError(null) }
  }, [open, routine, defaultKind])

  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }))

  const handleSave = async () => {
    const input = toInput(form, routine === null)
    if (typeof input === 'string') { setError(input); return }
    setSaving(true)
    try { await onSave(input); onClose() }
    catch { setError(t.plan_routine_error) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!onDelete || !window.confirm(t.routines_delete_confirm)) return
    setSaving(true)
    try { await onDelete(); onClose() }
    catch { setError(t.plan_routine_error) }
    finally { setSaving(false) }
  }

  const kinds: [RoutineKind, string][] = [
    ['block', t.routines_kind_block], ['task', t.routines_kind_task], ['habit', t.routines_kind_habit],
  ]

  return (
    <Modal open={open} onClose={onClose} title={routine ? t.routines_edit : t.routines_add} size="sm">
      <div className="space-y-4">
        <Input label={t.routines_name} value={form.title} onChange={(e) => patch({ title: e.target.value })} placeholder={t.routines_name_placeholder} />

        {/* Tür, var olan rutinde değişmez: örnekler farklı tablolarda. */}
        <div className="flex rounded-xl border border-border bg-background p-0.5">
          {kinds.map(([k, lbl]) => (
            <button key={k} type="button" disabled={routine !== null && routine.kind !== k}
              onClick={() => patch({ kind: k })}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-all disabled:opacity-40 ${form.kind === k ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-primary'}`}>
              {lbl}
            </button>
          ))}
        </div>

        {form.kind === 'habit' ? (
          <>
            <div className="flex gap-1 rounded-xl bg-background p-1">
              {(['daily', 'weekly'] as const).map((m) => (
                <button key={m} type="button" onClick={() => patch({ habitMode: m })}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-all ${form.habitMode === m ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-primary'}`}>
                  {m === 'daily' ? t.routines_habit_daily : t.routines_habit_weekly}
                </button>
              ))}
            </div>
            {form.habitMode === 'daily' ? (
              <Input label={t.routines_times_per_day} type="number" min={1} max={20} value={form.timesPerDay}
                onChange={(e) => patch({ timesPerDay: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })} />
            ) : (
              <Input label={t.routines_times_per_week} type="number" min={1} max={7} value={form.timesPerWeek}
                onChange={(e) => patch({ timesPerWeek: Math.min(7, Math.max(1, Number(e.target.value) || 1)) })} />
            )}
          </>
        ) : (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-primary">{t.routines_days}</label>
              <DayToggles days={form.days} onChange={(days) => patch({ days })} />
              <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={form.biweekly} onChange={(e) => patch({ biweekly: e.target.checked })} className="rounded" />
                {t.routines_biweekly}
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label={t.plan_start} type="time" value={form.start} onChange={(e) => patch({ start: e.target.value })} />
              <Input label={t.plan_end} type="time" value={form.end} onChange={(e) => patch({ end: e.target.value })} />
            </div>
            {form.kind === 'task' && <p className="-mt-2 text-[10px] text-muted">{t.routines_time_optional}</p>}
            {form.kind === 'block' && (
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(BLOCK_TYPE_LABELS) as BlockType[]).filter((b) => b !== 'task').map((b) => (
                  <button key={b} type="button" onClick={() => patch({ blockType: b })}
                    className={`rounded-lg px-3 py-1 text-xs font-medium ${form.blockType === b ? 'bg-accent text-white' : 'bg-border/40 text-muted hover:bg-border/60'}`}>
                    {BLOCK_TYPE_LABELS[b]}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <Input label={t.routines_ends_on} type="date" value={form.endsOn} onChange={(e) => patch({ endsOn: e.target.value })} />

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex justify-between gap-2">
          {routine && onDelete
            ? <Button variant="danger" size="sm" onClick={() => void handleDelete()} disabled={saving}>{t.plan_delete}</Button>
            : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>{t.plan_cancel}</Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={saving}>{t.routines_save}</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
