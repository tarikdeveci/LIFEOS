'use client'

import type { BlockType, CreateRoutineInput, Weekday } from '@lifeos/shared'
import { useLang } from '@/lib/contexts/LangContext'
import { Input } from '@/components/ui/Input'

export type RecurrenceEvery = 'daily' | 'weekly' | 'biweekly'

export interface RecurrenceValue {
  enabled: boolean
  every: RecurrenceEvery
  days: Weekday[]
  /** '' = süresiz */
  endsOn: string
}

export const ALL_WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6]
/** Ekranda Pazartesi başlangıçlı sıra. */
export const WEEKDAY_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0]

export function initialRecurrence(date: Date = new Date()): RecurrenceValue {
  return { enabled: false, every: 'weekly', days: [date.getDay() as Weekday], endsOn: '' }
}

/** Blok formundaki tekrar seçimini sunucu tarafı rutin şablonuna çevirir. */
export function recurrenceToRoutineInput(
  value: RecurrenceValue,
  block: { label: string; block_type: BlockType; start_time: string; end_time: string; date: string },
  fallbackTitle: string,
): CreateRoutineInput {
  return {
    title: block.label.trim() || fallbackTitle,
    kind: 'block',
    block_type: block.block_type,
    days_of_week: value.every === 'daily' ? ALL_WEEKDAYS : [...value.days].sort(),
    every_n_weeks: value.every === 'biweekly' ? 2 : 1,
    start_time: block.start_time,
    end_time: block.end_time,
    starts_on: block.date,
    ends_on: value.endsOn || null,
  }
}

export function DayToggles({ days, onChange }: { days: Weekday[]; onChange: (days: Weekday[]) => void }) {
  const { t } = useLang()
  const names = t.routines_day_names.split(',')
  return (
    <div className="flex gap-1">
      {WEEKDAY_ORDER.map((d) => (
        <button key={d} type="button"
          onClick={() => onChange(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}
          className={`rounded-lg px-2 py-1 text-[10px] font-medium ${days.includes(d) ? 'bg-accent text-white' : 'bg-border/40 text-muted hover:bg-border/60'}`}>
          {names[d]}
        </button>
      ))}
    </div>
  )
}

interface RecurrencePickerProps {
  value: RecurrenceValue
  onChange: (value: RecurrenceValue) => void
}

export function RecurrencePicker({ value, onChange }: RecurrencePickerProps) {
  const { t } = useLang()
  const options: [RecurrenceEvery, string][] = [
    ['daily', t.plan_recur_daily], ['weekly', t.plan_recur_weekly], ['biweekly', t.plan_recur_biweekly],
  ]
  return (
    <div className="rounded-xl border border-border/60 p-3">
      <label className="flex items-center gap-2 text-sm font-medium text-primary">
        <input type="checkbox" checked={value.enabled} onChange={(e) => onChange({ ...value, enabled: e.target.checked })} className="rounded" />
        {t.plan_recurring}
      </label>
      {value.enabled && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {options.map(([val, lbl]) => (
              <button key={val} type="button" onClick={() => onChange({ ...value, every: val })}
                className={`rounded-lg px-3 py-1 text-xs font-medium ${value.every === val ? 'bg-accent text-white' : 'bg-border/40 text-muted hover:bg-border/60'}`}>{lbl}</button>
            ))}
          </div>
          {value.every !== 'daily' && <DayToggles days={value.days} onChange={(days) => onChange({ ...value, days })} />}
          <div>
            <Input label={t.plan_end_date} type="date" value={value.endsOn} onChange={(e) => onChange({ ...value, endsOn: e.target.value })} />
            <p className="mt-1 text-[10px] text-muted">{t.plan_recur_no_end}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export type EditScope = 'this' | 'following'

/** Rutin örneğini düzenlerken/silerken "Sadece bu / Bu ve sonrakiler" seçimi. */
export function ScopeChoice({ value, onChange }: { value: EditScope; onChange: (v: EditScope) => void }) {
  const { t } = useLang()
  return (
    <div className="flex rounded-xl border border-border bg-background p-0.5">
      {([['this', t.plan_scope_this], ['following', t.plan_scope_following]] as [EditScope, string][]).map(([v, lbl]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${value === v ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-primary'}`}>
          {lbl}
        </button>
      ))}
    </div>
  )
}
