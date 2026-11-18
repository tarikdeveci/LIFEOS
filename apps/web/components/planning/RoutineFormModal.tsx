'use client'

import { useEffect, useState } from 'react'
import type { BlockType, CreateRoutineInput, DayPart, DayRows, Routine, RoutineDayOverride, RoutineKind, Weekday } from '@lifeos/shared'
import { BLOCK_TYPE_COLORS, DAY_PARTS, findSimilarRoutine, toDayRows, toOverrides, todayDate, useRoutineStore } from '@lifeos/shared'
import { useLang } from '@/lib/contexts/LangContext'
import { dayPartKey } from '@/lib/i18nFlex'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { DayToggles, WEEKDAY_ORDER } from '@/components/planning/RecurrencePicker'
import { RoutineDayOverridesEditor, useRoutineDayOverrides } from '@/components/planning/RoutineDayOverrides'
import { RoutineHabitPicker, RoutineProgramPicker } from '@/components/planning/RoutineLinkPickers'
import { TaskGoalSelect } from '@/components/tasks/TaskGoalSelect'

interface RoutineFormModalProps {
  userId: string
  open: boolean
  /** null = yeni rutin */
  routine: Routine | null
  onClose: () => void
  /** overrides: güne göre saatler (082); undefined = dokunma, [] = hepsini kaldır. */
  onSave: (input: CreateRoutineInput, overrides?: RoutineDayOverride[]) => Promise<void>
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
  /** Saat yerine gün bölümü (084); yalnız blok rutininde, doluysa saat alanları gizlenir. */
  dayPart: DayPart | null
  /** Gün bölümlü bloğun süresi (dk). */
  minutes: string
  /** Bağlı hedef; blok rutininde yok. */
  goalId: string | null
  /** Bağlı antrenman programı; yalnız blok rutininde, seçilince blok türü workout olur. */
  programId: string | null
  /** Bağlı alışkanlık (083); blok bitince alışkanlık işaretlenir. */
  habitId: string | null
  /** Asgari günde (081) de kalır. */
  isProtected: boolean
  /** Asgari günde gösterilen süre (dk); boş = blok süresi. */
  minMinutes: string
  /** "Günlere göre farklı" açık mı; satırlar kayıtlı override'lardan dolar. */
  perDay: boolean
  dayRows: DayRows
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

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
    dayPart: r?.day_part ?? null,
    minutes: String(r?.estimated_minutes ?? 30),
    goalId: r?.goal_id ?? null,
    programId: r?.workout_program_id ?? null,
    habitId: r?.habit_routine_id ?? null,
    isProtected: r?.is_protected ?? false,
    minMinutes: r?.min_minutes ? String(r.min_minutes) : '',
    perDay: false,
    dayRows: {},
  }
}

type FormError =
  | 'plan_err_name_required' | 'plan_err_pick_day' | 'plan_err_time_required' | 'plan_err_time_invalid'
  | 'plan_err_end_after_start' | 'routines_err_min_minutes' | 'routines_err_block_minutes'

/** Formu doğrular; hata varsa çeviri anahtarı, yoksa kayda hazır girdi döner. */
function toInput(f: FormState, isNew: boolean): CreateRoutineInput | FormError {
  const title = f.title.trim()
  if (!title) return 'plan_err_name_required'
  if (f.kind === 'habit') {
    // Her gün: hafta hedefi 7 gün, gün sayaç N'ye ulaşınca tamam (1 = tek işaret).
    return f.habitMode === 'weekly'
      ? { title, kind: 'habit', days_of_week: [], times_per_week: f.timesPerWeek, times_per_day: null, ends_on: f.endsOn || null, goal_id: f.goalId }
      : { title, kind: 'habit', days_of_week: [], times_per_week: 7, times_per_day: f.timesPerDay > 1 ? f.timesPerDay : null, ends_on: f.endsOn || null, goal_id: f.goalId }
  }
  if (f.days.length === 0) return 'plan_err_pick_day'
  // Gün bölümlü blok saatsizdir; sunucu bölümün varsayılan başlangıcına yerleştirir.
  const floating = f.kind === 'block' && f.dayPart !== null
  const hasTime = !floating && (f.start !== '' || f.end !== '')
  if (f.kind === 'block' && !floating && !hasTime) return 'plan_err_time_required'
  if (hasTime && (!TIME_RE.test(f.start) || !TIME_RE.test(f.end))) return 'plan_err_time_invalid'
  if (hasTime && f.end === f.start) return 'plan_err_end_after_start'
  const minMinutes = f.isProtected && f.minMinutes !== '' ? Number(f.minMinutes) : null
  if (minMinutes !== null && (!Number.isInteger(minMinutes) || minMinutes < 1 || minMinutes > 600)) return 'routines_err_min_minutes'
  const blockMinutes = Number(f.minutes)
  if (floating && (!Number.isInteger(blockMinutes) || blockMinutes < 5 || blockMinutes > 600)) return 'routines_err_block_minutes'
  const blockKind: BlockType = f.programId ? 'workout' : f.blockType
  return {
    title,
    kind: f.kind,
    block_type: f.kind === 'block' ? blockKind : 'task',
    days_of_week: [...f.days].sort(),
    every_n_weeks: f.biweekly ? 2 : 1,
    ...(hasTime && { start_time: f.start, end_time: f.end }),
    ...(floating && { start_time: null, end_time: null, estimated_minutes: blockMinutes }),
    day_part: floating ? f.dayPart : null,
    // İki haftalık parite starts_on'un haftasına çapalı: yeni rutinde bu hafta başlar,
    // düzenlemede eski çapa korunur ki seri bir hafta kaymasın.
    ...(isNew && { starts_on: todayDate() }),
    ends_on: f.endsOn || null,
    goal_id: f.kind === 'task' ? f.goalId : null,
    workout_program_id: f.kind === 'block' && blockKind === 'workout' ? f.programId : null,
    habit_routine_id: f.kind === 'block' ? f.habitId : null,
    is_protected: f.isProtected,
    min_minutes: minMinutes,
  }
}

const toggle = (on: boolean) =>
  `min-h-[36px] rounded-lg px-3 text-xs font-medium ${on ? 'bg-accent text-white' : 'bg-border/40 text-muted hover:bg-border/60'}`

export function RoutineFormModal({ userId, open, routine, onClose, onSave, onDelete, defaultKind = 'block' }: RoutineFormModalProps) {
  const { t } = useLang()
  const [form, setForm] = useState<FormState>(() => toForm(routine, defaultKind))
  // Hata ve benzer rutin uyarısı formun içinde görünür; uyarıdan sonra ikinci Kaydet yine kaydeder.
  const [notice, setNotice] = useState<{ text: string; warn: boolean } | null>(null)
  const [warnedId, setWarnedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const dayOverrides = useRoutineDayOverrides(routine, open)

  useEffect(() => {
    if (open) { setForm(toForm(routine, defaultKind)); setNotice(null); setWarnedId(null) }
  }, [open, routine, defaultKind])

  // Kayıtlı satırlar gelince form onlarla açılır; yoksa anahtar kapalı kalır.
  useEffect(() => {
    if (!open || dayOverrides.status !== 'ready' || dayOverrides.overrides.length === 0) return
    setForm((f) => ({ ...f, perDay: true, dayRows: toDayRows(dayOverrides.overrides) }))
  }, [open, dayOverrides])

  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }))
  const setError = (text: string) => setNotice({ text, warn: false })
  const floating = form.kind === 'block' && form.dayPart !== null

  const handleSave = async () => {
    const input = toInput(form, routine === null)
    if (typeof input === 'string') { setError(t[input]); return }
    // Yüklenemediyse ya da hâlâ yükleniyorsa kayıtlı satırlara dokunulmaz.
    let overrides: RoutineDayOverride[] | undefined
    if (form.kind !== 'habit' && dayOverrides.status === 'ready') {
      const next = form.perDay ? toOverrides(form.dayRows, input.days_of_week ?? []) : []
      if (typeof next === 'string') { setError(t[next]); return }
      overrides = next.length > 0 || dayOverrides.overrides.length > 0 ? next : undefined
    }
    const similar = findSimilarRoutine(input, useRoutineStore.getState().routines, routine?.id ?? null)
    if (similar && similar.id !== warnedId) {
      setWarnedId(similar.id)
      setNotice({ text: t.ux_routine_similar.replace('{title}', similar.title), warn: true })
      return
    }
    setNotice(null)
    setSaving(true)
    try { await onSave(input, overrides); onClose() }
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
            {form.kind === 'block' && (
              <button type="button" role="switch" aria-checked={floating} className={toggle(floating)}
                onClick={() => patch(floating
                  ? { dayPart: null, start: form.start || '09:00', end: form.end || '10:00' }
                  : { dayPart: 'morning' })}>
                {t.routines_day_part_toggle}
              </button>
            )}
            {floating ? (
              <>
                <div className="flex flex-wrap gap-1.5" role="radiogroup">
                  {DAY_PARTS.map((p) => (
                    <button key={p} type="button" role="radio" aria-checked={form.dayPart === p}
                      onClick={() => patch({ dayPart: p })} className={toggle(form.dayPart === p)}>
                      {t[dayPartKey(p)]}
                    </button>
                  ))}
                </div>
                <Input label={t.routines_block_minutes} inputMode="numeric" value={form.minutes}
                  onChange={(e) => patch({ minutes: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Input label={t.plan_start} type="time" value={form.start} onChange={(e) => patch({ start: e.target.value })} />
                <Input label={t.plan_end} type="time" value={form.end} onChange={(e) => patch({ end: e.target.value })} />
              </div>
            )}
            {form.kind === 'task' && <p className="-mt-2 text-[10px] text-muted">{t.routines_time_optional}</p>}
            {form.kind === 'block' && !form.programId && (
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(BLOCK_TYPE_COLORS) as BlockType[]).filter((b) => b !== 'task').map((b) => (
                  <button key={b} type="button" onClick={() => patch({ blockType: b })}
                    className={`rounded-lg px-3 py-1 text-xs font-medium ${form.blockType === b ? 'bg-accent text-white' : 'bg-border/40 text-muted hover:bg-border/60'}`}>
                    {t[`review_type_${b}`]}
                  </button>
                ))}
              </div>
            )}
            {form.days.length > 1 && dayOverrides.status === 'ready' && (
              <button type="button" role="switch" aria-checked={form.perDay} className={toggle(form.perDay)}
                onClick={() => patch({ perDay: !form.perDay })}>
                {t.routines_per_day}
              </button>
            )}
            {dayOverrides.status === 'error' && <p className="text-xs text-muted">{t.routines_per_day_load_error}</p>}
            {form.perDay && form.days.length > 1 && dayOverrides.status === 'ready' && (
              <RoutineDayOverridesEditor days={WEEKDAY_ORDER.filter((d) => form.days.includes(d))}
                rows={form.dayRows} onChange={(dayRows) => patch({ dayRows })} start={form.start} end={form.end} />
            )}
            <div className="space-y-2">
              <button type="button" role="switch" aria-checked={form.isProtected} className={toggle(form.isProtected)}
                onClick={() => patch({ isProtected: !form.isProtected })}>
                {t.routines_protected}
              </button>
              {form.isProtected && (
                <Input label={t.routines_min_minutes} inputMode="numeric" value={form.minMinutes}
                  onChange={(e) => patch({ minMinutes: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
              )}
            </div>
          </>
        )}

        {form.kind !== 'block' && (
          <TaskGoalSelect userId={userId} goalId={form.goalId} onChange={(goalId) => patch({ goalId })} />
        )}
        {form.kind === 'block' && (
          <>
            <RoutineProgramPicker userId={userId} programId={form.programId} onChange={(programId) => patch({ programId })} />
            <RoutineHabitPicker habitId={form.habitId} onChange={(habitId) => patch({ habitId })} />
          </>
        )}

        <Input label={t.routines_ends_on} type="date" value={form.endsOn} onChange={(e) => patch({ endsOn: e.target.value })} />

        {notice && <p role="status" className={`text-xs ${notice.warn ? 'text-warning' : 'text-danger'}`}>{notice.text}</p>}

        <div className="flex justify-between gap-2">
          {routine && onDelete
            ? <Button variant="danger" size="sm" onClick={() => void handleDelete()} disabled={saving}>{t.plan_delete}</Button>
            : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>{t.plan_cancel}</Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={saving}>{notice?.warn ? t.ux_routine_save_anyway : t.routines_save}</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
