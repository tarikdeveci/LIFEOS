'use client'

import Link from 'next/link'
import { CalendarDays, ChevronDown, ChevronUp } from 'lucide-react'
import { BLOCK_TYPE_COLORS } from '@lifeos/shared'
import { useLang } from '@/lib/contexts/LangContext'
import { blockTimeText } from '@/lib/i18nFlex'
import type { MinimumDay } from '@/lib/hooks/useMinimumDay'
import { useProgramDays, withProgramDay } from '@/lib/hooks/useProgramDays'
import { Button } from '@/components/ui/Button'

interface TodayPlanCardProps {
  userId: string
  day: MinimumDay
}

/** Panodaki bugünün planı: bloklar (asgari günde sadece korunanlar) ve asgari gün düğmesi. */
export function TodayPlanCard({ userId, day }: TodayPlanCardProps) {
  const { t } = useLang()
  const blocks = [...day.active.blocks].sort((a, b) => a.start_time.localeCompare(b.start_time))
  const programDays = useProgramDays(userId, blocks)

  return (
    <div className="col-span-4 glass rounded-2xl p-4">
      <h2 className="mb-4 flex items-center gap-2 font-semibold text-primary">
        <CalendarDays size={15} className="text-accent" /> {t.dash_today_plan}
        <span className="ml-auto text-xs font-normal text-muted">
          {blocks.length} {t.dash_blocks}
        </span>
      </h2>

      {blocks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-8 text-center">
          <p className="text-sm text-muted">{t.dash_no_blocks}</p>
          <Link href="/planning" className="mt-2 block text-xs text-accent hover:underline">
            {t.dash_go_planning}
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {blocks.map((block) => {
            const color = block.color ?? BLOCK_TYPE_COLORS[block.block_type]
            const label = withProgramDay(block.label ?? t[`review_type_${block.block_type}`], programDays[block.id])
            return (
              <div key={block.id} className="flex items-center gap-3 rounded-xl px-3 py-2" style={{ backgroundColor: `${color}15` }}>
                <div className="h-10 w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" style={{ color }}>{label}</p>
                  <p className="text-xs text-muted tabular-nums">
                    {blockTimeText(block, t)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <MinimumDayControls day={day} />
    </div>
  )
}

/** Asgari gün düğmesi, kapalı kalanların soluk listesi ve korunan rutin yoksa yol gösterme. */
function MinimumDayControls({ day }: { day: MinimumDay }) {
  const { t } = useLang()
  if (!day.ready) return null
  // Görev bloğu ile görevi aynı başlıkla iki kez göstermemek için blokla eşleşen görev atlanır.
  const blockTaskIds = new Set(day.closed.blocks.map((b) => b.task_id).filter(Boolean))
  const closedRows = [
    ...day.closed.blocks.map((b) => ({ id: b.id, label: b.label ?? '', time: b.day_part ? '' : b.start_time.slice(0, 5) })),
    ...day.closed.tasks.filter((x) => !blockTaskIds.has(x.id)).map((x) => ({ id: x.id, label: x.title, time: '' })),
  ]

  return (
    <div className="mt-3 space-y-2">
      {day.minimum && <p className="text-sm text-muted">{t.today_minimum_hint}</p>}
      {day.minimum && !day.hasProtected && (
        <Link href="/planning" className="block rounded-lg py-1 text-sm">
          <span className="block text-primary">{t.today_minimum_empty}</span>
          <span className="mt-0.5 block font-semibold text-accent hover:underline">{t.today_minimum_go_routines}</span>
        </Link>
      )}
      {day.minimum && closedRows.length > 0 && (
        <button
          type="button"
          onClick={() => day.setShowClosed(!day.showClosed)}
          aria-expanded={day.showClosed}
          className="flex min-h-[44px] w-full items-center justify-between text-sm font-medium text-muted hover:text-primary"
        >
          {t.today_minimum_closed.replace('{n}', String(closedRows.length))}
          {day.showClosed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      )}
      {day.minimum && day.showClosed && closedRows.map((row) => (
        <div key={row.id} className="flex gap-3 py-1 opacity-50">
          <span className="w-10 text-xs text-muted tabular-nums">{row.time}</span>
          <span className="flex-1 truncate text-sm text-primary">{row.label}</span>
        </div>
      ))}
      {day.failed && <p role="status" className="text-sm text-danger">{t.today_minimum_error}</p>}
      <Button variant="secondary" size="sm" className="min-h-[44px] w-full" loading={day.busy} onClick={() => void day.toggle()}>
        {day.minimum ? t.today_minimum_off : t.today_minimum_on}
      </Button>
    </div>
  )
}
