'use client'

import { useEffect } from 'react'
import { habitLinkOptions, useRoutineStore, useWorkoutStore } from '@lifeos/shared'
import { supabase } from '@/lib/supabase/client'
import { useLang } from '@/lib/contexts/LangContext'

interface ChipOption { id: string; label: string }

interface ChipPickerProps {
  title: string
  noneLabel: string
  hint: string
  options: ChipOption[]
  value: string | null
  onChange: (id: string | null) => void
}

function ChipPicker({ title, noneLabel, hint, options, value, onChange }: ChipPickerProps) {
  const chip = (active: boolean) =>
    `min-h-[36px] max-w-[12rem] truncate rounded-lg px-3 text-xs font-medium ${active ? 'bg-accent text-white' : 'bg-border/40 text-muted hover:bg-border/60'}`
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-primary">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={value === null} onClick={() => onChange(null)} className={chip(value === null)}>{noneLabel}</button>
        {options.map((o) => (
          <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)} className={chip(value === o.id)}>{o.label}</button>
        ))}
      </div>
      {value !== null && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  )
}

interface ProgramPickerProps {
  userId: string
  programId: string | null
  onChange: (programId: string | null) => void
}

/** Blok rutinini bir antrenman programına bağlar; kullanıcının programı yoksa hiç görünmez. */
export function RoutineProgramPicker({ userId, programId, onChange }: ProgramPickerProps) {
  const { t } = useLang()
  const programs = useWorkoutStore((s) => s.programs)

  useEffect(() => {
    const store = useWorkoutStore.getState()
    if (store.programs.length === 0) void store.fetchPrograms(supabase, userId).catch(() => undefined)
  }, [userId])

  const options = programs.filter((p) => p.user_id !== null || p.id === programId).map((p) => ({ id: p.id, label: p.name }))
  if (options.length === 0) return null
  return (
    <ChipPicker title={t.ux_routine_program} noneLabel={t.ux_routine_program_none} hint={t.ux_routine_program_hint}
      options={options} value={programId} onChange={onChange} />
  )
}

interface HabitPickerProps {
  habitId: string | null
  onChange: (habitId: string | null) => void
}

/** Blok rutinini bir alışkanlığa bağlar (083); alışkanlık yoksa hiç görünmez. */
export function RoutineHabitPicker({ habitId, onChange }: HabitPickerProps) {
  const { t } = useLang()
  const routines = useRoutineStore((s) => s.routines)
  const options = habitLinkOptions(routines, habitId).map((h) => ({ id: h.id, label: h.title }))
  if (options.length === 0) return null
  return (
    <ChipPicker title={t.ux_routine_habit} noneLabel={t.ux_routine_habit_none} hint={t.ux_routine_habit_hint}
      options={options} value={habitId} onChange={onChange} />
  )
}
