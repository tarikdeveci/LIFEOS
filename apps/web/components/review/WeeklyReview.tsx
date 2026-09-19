'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { fromDateString, shiftIsoDate, toDateString, weekStart, type BlockType } from '@lifeos/shared'
import { useLang } from '@/lib/contexts/LangContext'
import { useWeeklyReview } from '@/lib/hooks/useWeeklyReview'
import { DayBars, MetricCard, TaskList, TypeBreakdown } from '@/components/review/ReviewParts'

interface WeeklyReviewProps { userId: string }

function diff(current: number | null, previous: number | null): number | null {
  return current == null || previous == null ? null : current - previous
}

/**
 * Haftalık değerlendirme: seçili hafta geçen haftayla yan yana. Planlanan ve
 * tamamlanan blok süresi, biten ve yarım kalan görevler, öğün ve antrenman
 * düzeni. Ana sayfadaki grafik yalnızca bu haftayı gösterir; burası geriye
 * dönük bakış ve karşılaştırma içindir.
 */
export function WeeklyReview({ userId }: WeeklyReviewProps) {
  const { t, lang } = useLang()
  const locale = lang === 'tr' ? 'tr-TR' : 'en-US'
  const thisWeek = toDateString(weekStart(new Date()))
  const [start, setStart] = useState(thisWeek)
  const { data, failed } = useWeeklyReview(userId, start)

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const rest = Math.round(minutes % 60)
    if (hours === 0) return `${rest} ${t.review_minutes}`
    return rest === 0 ? `${hours} ${t.review_hours}` : `${hours} ${t.review_hours} ${rest} ${t.review_minutes}`
  }
  const percent = (value: number | null) => {
    if (value == null) return '-'
    const rounded = Math.round(value * 100)
    return lang === 'tr' ? `%${rounded}` : `${rounded}%`
  }
  const vsLast = (value: string) => t.review_vs_last.replace('{value}', value)
  const dayName = (date: string) => fromDateString(date).toLocaleDateString(locale, { weekday: 'short' })
  const shortDate = (date: string) => fromDateString(date).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
  const typeNames: Record<BlockType, string> = {
    task: t.review_type_task, routine: t.review_type_routine, break: t.review_type_break,
    focus: t.review_type_focus, meal: t.review_type_meal, workout: t.review_type_workout,
  }

  const end = shiftIsoDate(start, 6)
  const badge = start === thisWeek ? t.review_this_week : start === shiftIsoDate(thisWeek, -7) ? t.review_last_week : null

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">{t.review_title}</h1>
          <p className="text-sm text-muted">
            {shortDate(start)} - {fromDateString(end).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
            {badge && <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">{badge}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setStart(shiftIsoDate(start, -7))} aria-label={t.review_prev}
            className="rounded-lg border border-border p-2 text-muted hover:text-primary"><ChevronLeft size={16} /></button>
          <button type="button" onClick={() => setStart(shiftIsoDate(start, 7))} aria-label={t.review_next}
            disabled={start >= thisWeek}
            className="rounded-lg border border-border p-2 text-muted hover:text-primary disabled:opacity-30"><ChevronRight size={16} /></button>
          <Link href="/planning" className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent/90">
            {t.review_go_planning}
          </Link>
        </div>
      </div>

      {failed ? (
        <p className="glass rounded-2xl p-6 text-sm text-danger">{t.review_load_error}</p>
      ) : !data ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : (() => {
        const { current: cur, previous: prev } = data
        const topType = cur.minutesByType[0]
        const highlights = [
          cur.bestDay && t.review_best_day.replace('{day}', fromDateString(cur.bestDay).toLocaleDateString(locale, { weekday: 'long' })),
          topType && t.review_top_type.replace('{type}', typeNames[topType.type].toLocaleLowerCase(locale)),
          cur.carryover.length > 0 && t.review_carryover_count.replace('{n}', String(cur.carryover.length)),
        ].filter((line): line is string => typeof line === 'string')

        return (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <MetricCard label={t.review_block_time} value={formatMinutes(cur.completedMinutes)}
                detail={cur.plannedMinutes > 0
                  ? t.review_planned_total.replace('{planned}', formatMinutes(cur.plannedMinutes)).replace('{rate}', percent(cur.blockRate))
                  : t.review_no_blocks}
                delta={cur.completedMinutes - prev.completedMinutes} deltaLabel={vsLast(formatMinutes(prev.completedMinutes))} />
              <MetricCard label={t.review_tasks_done} value={String(cur.tasksCompleted)}
                delta={cur.tasksCompleted - prev.tasksCompleted} deltaLabel={vsLast(String(prev.tasksCompleted))} />
              <MetricCard label={t.review_plan_adherence} value={percent(cur.scheduledRate)}
                detail={cur.scheduledTotal > 0 ? `${cur.scheduledDone}/${cur.scheduledTotal}` : undefined}
                delta={diff(cur.scheduledRate, prev.scheduledRate)}
                deltaLabel={prev.scheduledRate == null ? t.review_no_previous : vsLast(percent(prev.scheduledRate))} />
              <MetricCard label={t.review_workouts} value={`${cur.workoutsDone}/${cur.workoutsPlanned}`}
                delta={cur.workoutsDone - prev.workoutsDone} deltaLabel={vsLast(String(prev.workoutsDone))} />
              <MetricCard label={t.review_meals_logged} value={`${cur.loggedDays}/7`}
                detail={cur.avgCalories == null ? undefined : t.review_avg_calories
                  .replace('{kcal}', String(Math.round(cur.avgCalories)))
                  .replace('{target}', data.calorieTarget ? String(data.calorieTarget) : '-')}
                delta={cur.loggedDays - prev.loggedDays} deltaLabel={vsLast(`${prev.loggedDays}/7`)} />
              <MetricCard label={t.review_energy} value={cur.avgEnergy == null ? '-' : `${cur.avgEnergy.toFixed(1)}/5`}
                delta={diff(cur.avgEnergy, prev.avgEnergy)}
                deltaLabel={prev.avgEnergy == null ? t.review_no_previous : vsLast(prev.avgEnergy.toFixed(1))} />
            </div>

            {highlights.length > 0 && (
              <div className="glass rounded-2xl p-5">
                <h2 className="mb-2 text-sm font-semibold text-primary">{t.review_highlights}</h2>
                <ul className="list-disc space-y-1 pl-5 text-sm text-primary">
                  {highlights.map((line) => <li key={line}>{line}</li>)}
                </ul>
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="glass rounded-2xl p-5 lg:col-span-2">
                <h2 className="mb-4 text-sm font-semibold text-primary">{t.review_by_day}</h2>
                <DayBars days={cur.days} dayName={dayName} plannedLabel={t.review_planned}
                  completedLabel={t.review_completed_label} tasksLabel={t.review_tasks_short} />
              </div>
              <div className="glass rounded-2xl p-5">
                <h2 className="mb-4 text-sm font-semibold text-primary">{t.review_by_type}</h2>
                {cur.minutesByType.length > 0
                  ? <TypeBreakdown entries={cur.minutesByType} typeName={(type) => typeNames[type]} formatMinutes={formatMinutes} />
                  : <p className="text-sm text-muted">{t.review_no_blocks}</p>}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="glass rounded-2xl p-5">
                <h2 className="mb-3 text-sm font-semibold text-primary">{t.review_carryover} ({cur.carryover.length})</h2>
                <TaskList tasks={cur.carryover} empty={t.review_carryover_empty} limit={8}
                  moreLabel={(n) => t.review_more.replace('{n}', String(n))}
                  meta={(task) => (task.scheduled_date ? shortDate(task.scheduled_date) : null)} />
              </div>
              <div className="glass rounded-2xl p-5">
                <h2 className="mb-3 text-sm font-semibold text-primary">{t.review_completed} ({cur.tasksCompleted})</h2>
                <TaskList tasks={cur.completed} empty={t.review_completed_empty} limit={8}
                  moreLabel={(n) => t.review_more.replace('{n}', String(n))}
                  meta={(task) => (task.completed_at ? dayName(toDateString(new Date(task.completed_at))) : null)} />
              </div>
            </div>
          </>
        )
      })()}
    </div>
  )
}
