'use client'

import { usePlanningStore } from '@lifeos/shared'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase/client'
import { useLang } from '@/lib/contexts/LangContext'

const ENERGY_EMOJIS = ['😴', '😐', '🙂', '😊', '🔥'] as const

interface DayStartCardProps {
  /** Ritüel sadece bugün sorulur; enerji her gün seçilebilir. */
  isToday: boolean
  onStartRitual: () => void
}

/**
 * Günün ilk girdisi: enerji ve sabah ritüeli tek kartta. Ritüel bitene kadar
 * tam kart; sonra tek satırlık enerji seçici kalır (AI planı enerjiye göre kurulur).
 */
export function DayStartCard({ isToday, onStartRitual }: DayStartCardProps) {
  const { t } = useLang()
  const { dailyPlan, setEnergyLevel, completeRitual } = usePlanningStore()
  if (!dailyPlan) return null

  const labels = [t.dash_energy_low, t.dash_energy_tired, t.dash_energy_ok, t.dash_energy_good, t.dash_energy_great]
  const energy = (compact: boolean) => (
    <div className={compact ? 'flex gap-1' : 'grid grid-cols-5 gap-1.5'}>
      {ENERGY_EMOJIS.map((emoji, i) => {
        const level = (i + 1) as 1 | 2 | 3 | 4 | 5
        const active = dailyPlan.energy_level === level
        return (
          <button key={level} onClick={() => void setEnergyLevel(supabase, level)} title={labels[i]} aria-pressed={active}
            className={`flex flex-col items-center gap-0.5 rounded-xl border px-2 py-1.5 transition-colors ${active ? 'border-accent bg-accent/10' : 'border-transparent hover:border-border'}`}>
            <span className={compact ? 'text-base' : 'text-xl'}>{emoji}</span>
            {!compact && <span className="text-[10px] text-muted">{labels[i]}</span>}
          </button>
        )
      })}
    </div>
  )

  if (isToday && !dailyPlan.ritual_completed_at) {
    return (
      <div className="rounded-2xl border border-accent/20 bg-accent/5 p-4">
        <p className="text-sm font-medium text-primary">{t.ritual_banner}</p>
        <p className="mb-3 text-xs text-muted">{t.plan_energy_q}</p>
        {energy(false)}
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={onStartRitual}>{t.ritual_start}</Button>
          <Button size="sm" variant="ghost" onClick={() => void completeRitual(supabase)}>{t.ritual_skip}</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="glass flex items-center justify-between gap-2 rounded-2xl px-4 py-2.5">
      <span className="text-sm font-medium text-primary">{t.dash_energy}</span>
      {energy(true)}
    </div>
  )
}
