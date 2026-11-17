'use client'

import { useEffect, useState } from 'react'
import type { DayRow, DayRows, Routine, RoutineDayOverride, Weekday } from '@lifeos/shared'
import { getRoutineDayOverrides } from '@lifeos/shared/supabase'
import { supabase } from '@/lib/supabase/client'
import { useLang } from '@/lib/contexts/LangContext'
import { Input } from '@/components/ui/Input'

type OverridesState =
  | { status: 'ready' | 'error'; overrides: RoutineDayOverride[] }
  | { status: 'loading'; overrides: RoutineDayOverride[] }

const READY_EMPTY: OverridesState = { status: 'ready', overrides: [] }
const LOADING: OverridesState = { status: 'loading', overrides: [] }

/**
 * Düzenlenen rutinin güne göre saatleri (082). Yeni rutinde hemen hazır, boş liste. Sonuç hangi
 * rutine aitse onunla eşleşmedikçe 'loading' döner: başka rutin açılınca önceki satırlar forma sızmaz.
 */
export function useRoutineDayOverrides(routine: Routine | null, open: boolean): OverridesState {
  const routineId = routine && routine.kind !== 'habit' ? routine.id : null
  const [state, setState] = useState<{ forId: string; status: 'ready' | 'error'; overrides: RoutineDayOverride[] } | null>(null)

  useEffect(() => {
    if (!open || !routineId) return
    let alive = true
    getRoutineDayOverrides(supabase, routineId)
      .then((overrides) => { if (alive) setState({ forId: routineId, status: 'ready', overrides }) })
      .catch(() => { if (alive) setState({ forId: routineId, status: 'error', overrides: [] }) })
    return () => { alive = false; setState(null) }
  }, [open, routineId])

  if (!routineId) return READY_EMPTY
  if (!state || state.forId !== routineId) return LOADING
  return state
}

interface RoutineDayOverridesEditorProps {
  /** Seçili günler, ekrandaki sırayla (Pazartesi başta). */
  days: Weekday[]
  rows: DayRows
  onChange: (rows: DayRows) => void
  /** Şablonun saati: "Saat" seçilince alanlar bununla dolar. */
  start: string
  end: string
}

/** "Günlere göre farklı" açıkken her seçili gün için Aynı, Saat ya da Süre. */
export function RoutineDayOverridesEditor({ days, rows, onChange, start, end }: RoutineDayOverridesEditorProps) {
  const { t } = useLang()
  const names = t.routines_day_names.split(',')

  const setRow = (d: Weekday, row: DayRow | null) => {
    const next = { ...rows }
    if (row) next[d] = row
    else delete next[d]
    onChange(next)
  }

  const modes: [DayRow['mode'] | 'same', string][] = [
    ['same', t.routines_per_day_same], ['time', t.routines_per_day_time], ['minutes', t.routines_per_day_minutes],
  ]

  return (
    <div className="space-y-3 rounded-xl bg-background/60 p-2">
      {days.map((d) => {
        const row = rows[d]
        const current = row?.mode ?? 'same'
        return (
          <div key={d} className="space-y-2">
            <div className="flex items-center gap-2" role="radiogroup" aria-label={names[d]}>
              <span className="w-10 text-sm font-semibold text-primary">{names[d]}</span>
              {modes.map(([m, label]) => (
                <button key={m} type="button" role="radio" aria-checked={current === m}
                  onClick={() => setRow(d, m === 'same' ? null : { mode: m, start: row?.start || start, end: row?.end || end, minutes: row?.minutes ?? '' })}
                  className={`min-h-[36px] rounded-lg px-3 text-xs font-medium ${current === m ? 'bg-accent text-white' : 'bg-border/40 text-muted hover:bg-border/60'}`}>
                  {label}
                </button>
              ))}
            </div>
            {row?.mode === 'time' && (
              <div className="grid grid-cols-2 gap-3">
                <Input label={t.plan_start} type="time" value={row.start} onChange={(e) => setRow(d, { ...row, start: e.target.value })} id={`ovr-start-${d}`} />
                <Input label={t.plan_end} type="time" value={row.end} onChange={(e) => setRow(d, { ...row, end: e.target.value })} id={`ovr-end-${d}`} />
              </div>
            )}
            {row?.mode === 'minutes' && (
              <Input label={t.routines_per_day_minutes_label} inputMode="numeric" value={row.minutes} id={`ovr-min-${d}`}
                onChange={(e) => setRow(d, { ...row, minutes: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
            )}
          </div>
        )
      })}
    </div>
  )
}
