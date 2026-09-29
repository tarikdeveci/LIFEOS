'use client'

import { useState } from 'react'
import { DEFAULT_WORKDAY, minutesOfDay, shiftRemaining, usePlanningStore } from '@lifeos/shared'
import { supabase } from '@/lib/supabase/client'
import { useLang } from '@/lib/contexts/LangContext'
import { useToast } from '@/components/ui/Toast'

const DELAYS = [10, 15, 30, 60] as const

/** "Geciktim": bugünün bitmemiş bloklarını zincirleme kaydırır. */
export function ShiftButton() {
  const { t } = useLang()
  const { showToast } = useToast()
  const { timeBlocks, applyShift } = usePlanningStore()
  const [open, setOpen] = useState(false)

  const shift = async (delay: number) => {
    setOpen(false)
    const result = shiftRemaining(timeBlocks, delay, minutesOfDay())
    if (result.updates.length === 0) { showToast(t.shift_nothing, 'info'); return }
    try {
      await applyShift(supabase, result.updates)
      const notes = [t.shift_done.replace('{n}', String(result.updates.length))]
      if (result.pastDayEnd) notes.push(t.shift_past_end.replace('{end}', DEFAULT_WORKDAY.end))
      if (result.overflow.length > 0) notes.push(t.shift_overflow.replace('{n}', String(result.overflow.length)))
      showToast(notes.join(' '), 'success')
    } catch { showToast('Bloklar kaydırılamadı', 'error') }
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} title={t.shift_title}
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-accent hover:text-primary">
        {t.shift_btn}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 flex gap-1 rounded-xl border border-border bg-surface p-1 shadow-lg">
          {DELAYS.map((d) => (
            <button key={d} onClick={() => void shift(d)}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-primary hover:bg-accent/10">+{d} dk</button>
          ))}
        </div>
      )}
    </div>
  )
}
