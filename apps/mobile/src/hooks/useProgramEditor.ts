import { useState } from 'react'
import { reorderProgramExercises, useWorkoutStore } from '@lifeos/shared'
import type { WorkoutProgram } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { useLang } from '@/src/contexts/LangContext'

type Mode = { kind: 'names' } | { kind: 'exercise'; dayId: string; rowId: string } | null

/** Kendi programında ad, gün adları ve tek hareketin set, tekrar, dinlenme ve sırası. Kaydet tek yazma noktası. */
export function useProgramEditor(userId: string | null, program: WorkoutProgram | null) {
  const { t } = useLang()
  const { renameProgram, editProgramExercise } = useWorkoutStore()
  const [mode, setMode] = useState<Mode>(null)
  const [programName, setProgramName] = useState('')
  const [dayNames, setDayNames] = useState<Record<string, string>>({})
  const [sets, setSets] = useState('')
  const [reps, setReps] = useState('')
  const [rest, setRest] = useState('')
  const [position, setPosition] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const workDays = [...(program?.days ?? [])].filter((d) => !d.is_rest).sort((a, b) => a.day_number - b.day_number)
  const editDay = mode?.kind === 'exercise' ? workDays.find((d) => d.id === mode.dayId) ?? null : null
  const dayExercises = [...(editDay?.exercises ?? [])].sort((a, b) => a.order_index - b.order_index)
  const editRow = mode?.kind === 'exercise' ? dayExercises.find((e) => e.id === mode.rowId) ?? null : null

  function openNames() {
    if (!program) return
    setProgramName(program.name)
    setDayNames(Object.fromEntries(workDays.map((d) => [d.id, d.day_name ?? ''])))
    setError(null); setMode({ kind: 'names' })
  }

  function openExercise(dayId: string, rowId: string) {
    const day = workDays.find((d) => d.id === dayId)
    const rows = [...(day?.exercises ?? [])].sort((a, b) => a.order_index - b.order_index)
    const index = rows.findIndex((r) => r.id === rowId)
    const row = rows[index]
    if (!row) return
    setSets(String(row.sets)); setReps(row.reps === null ? '' : String(row.reps)); setRest(String(row.rest_seconds))
    setPosition(index + 1); setError(null); setMode({ kind: 'exercise', dayId, rowId })
  }

  function close() { setMode(null); setError(null) }

  async function saveNames() {
    if (!userId || !program || saving) return
    const name = programName.trim()
    if (!name) { setError(t.ux_wk_err_name); return }
    const changedDays = workDays
      .map((d) => ({ id: d.id, day_name: (dayNames[d.id] ?? '').trim() }))
      .filter((d) => d.day_name !== (workDays.find((w) => w.id === d.id)?.day_name ?? '').trim())
    await save(() => renameProgram(supabase, userId, program.id, name === program.name ? null : name, changedDays))
  }

  async function saveExercise() {
    if (!userId || !editRow || saving) return
    const s = Number(sets.trim())
    if (!Number.isInteger(s) || s < 1 || s > 10) { setError(t.ux_wk_err_sets); return }
    const r = reps.trim() === '' ? null : Number(reps.trim())
    if (r !== null && (!Number.isInteger(r) || r < 1 || r > 100)) { setError(t.ux_wk_err_reps); return }
    const rs = Number(rest.trim())
    if (rest.trim() === '' || !Number.isInteger(rs) || rs < 0 || rs > 600) { setError(t.ux_wk_err_rest); return }
    const reorder = reorderProgramExercises(dayExercises, editRow.id, position)
    await save(() => editProgramExercise(supabase, userId, editRow.id, { sets: s, reps: r, rest_seconds: rs }, reorder))
  }

  async function save(write: () => Promise<void>) {
    setSaving(true); setError(null)
    try {
      await write()
      setMode(null)
    } catch {
      setError(t.ux_wk_err_save)
    } finally {
      setSaving(false)
    }
  }

  return {
    mode, open: mode !== null, openNames, openExercise, close,
    programName, setProgramName, dayNames, setDayNames, workDays,
    editRow, sets, setSets, reps, setReps, rest, setRest, position, setPosition, total: dayExercises.length,
    error, saving, saveNames, saveExercise,
  }
}

export type ProgramEditor = ReturnType<typeof useProgramEditor>
