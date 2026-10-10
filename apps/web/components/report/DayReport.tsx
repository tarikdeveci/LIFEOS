'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, Sparkles } from 'lucide-react'
import {
  fill, formatDay, hasVitals, resolveReportDate, todayDate, useDayReport,
  type DailyReport, type DayReportState, type DaySummary, type RingTone,
} from '@lifeos/shared'
import { supabase } from '@/lib/supabase/client'
import { useLang } from '@/lib/contexts/LangContext'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { Button } from '@/components/ui/Button'
import { OpenItems, Postponed, SectionTitle } from '@/components/report/ReportClosure'
import { HabitsWeek, Programs, Vitals } from '@/components/report/ReportProgress'

interface DayReportProps {
  /** Adresteki ?date; bozuksa, gelecekse ya da 30 günden eskiyse bugün açılır. */
  rawDate: string | null
}

interface HeroProps {
  date: string
  report: DailyReport
  summary: DaySummary
  stale: boolean
}

interface InsightProps {
  day: DayReportState
  isAi: boolean
  isPro: boolean
  checking: boolean
  upsell: boolean
}

type Swatch = RingTone | 'open'

const TONE_CLASS: Record<Swatch, string> = {
  done: 'bg-accent',
  partial: 'bg-accent/40',
  rest: 'bg-border',
  open: 'border border-subtle',
}

function BackLink() {
  const { t } = useLang()
  return (
    <Link href="/planning" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-primary">
      <ArrowLeft className="h-4 w-4" /> {t.report_back}
    </Link>
  )
}

function Hero({ date, report, summary, stale }: HeroProps) {
  const { t, lang } = useLang()
  const narrative = report.narrative
  const dateLabel = formatDay(date, lang)
  const energyLabels = [t.report_energy_1, t.report_energy_2, t.report_energy_3, t.report_energy_4, t.report_energy_5]
  const energy = report.facts.energy
  const energyLabel = energy !== null ? energyLabels[energy - 1] : undefined
  const stats: Array<{ id: Swatch; value: number; label: string }> = [
    { id: 'done', value: summary.done, label: t.report_stat_done },
    { id: 'partial', value: summary.partial, label: t.report_stat_partial },
    { id: 'rest', value: summary.skipped, label: t.report_stat_skipped },
    { id: 'open', value: summary.open, label: t.report_stat_open },
  ]

  return (
    <header className="space-y-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold tracking-wider text-subtle">{t.report_kicker.toLocaleUpperCase(lang)}</span>
          {narrative?.source === 'ai' && (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">{t.report_ai_tag}</span>
          )}
        </div>
        {narrative?.headline && <p className="text-sm text-muted">{dateLabel}</p>}
        <h1 className="text-2xl font-bold text-primary">{narrative?.headline ?? dateLabel}</h1>
        {stale && <p aria-live="polite" className="text-sm text-muted">{t.report_stale}</p>}
      </div>

      {summary.total > 0 && (
        <div className="glass space-y-3 rounded-2xl p-4">
          <div className="flex items-baseline gap-1 tabular-nums">
            <span className="text-4xl font-extrabold text-primary">{summary.done}</span>
            <span className="text-base font-semibold text-muted">/{summary.total}</span>
          </div>
          {/* Günün sırasıyla her iş bir dilim; renk tek başına anlam taşımaz, altında sayı ve sözcük var. */}
          <div className="flex gap-0.5" role="img" aria-label={fill(t.report_ring_label, { done: summary.done, total: summary.total })}>
            {summary.tones.map((tone, index) => <div key={index} className={`h-2 flex-1 rounded-full ${TONE_CLASS[tone]}`} />)}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {stats.filter((s) => s.value > 0).map((s) => (
              <span key={s.id} className="flex items-center gap-1.5 text-sm">
                <span className={`h-2.5 w-2.5 rounded-sm ${TONE_CLASS[s.id]}`} />
                <span className="font-bold tabular-nums text-primary">{s.value}</span>
                <span className="text-muted">{s.label}</span>
              </span>
            ))}
          </div>
          {energyLabel && <p className="text-sm text-muted">{fill(t.report_energy, { label: energyLabel })}</p>}
        </div>
      )}
    </header>
  )
}

/** Raporun sonundaki AI yorumu. Şablon anlatı herkes için eksiksizdir; bu kart üstüne yorum ister. */
function Insight({ day, isAi, isPro, checking, upsell }: InsightProps) {
  const { t } = useLang()
  if (isAi) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Sparkles className="h-4 w-4" /> {t.report_ai_ready}
      </p>
    )
  }
  return (
    <div className="glass space-y-3 rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" />
        <h2 className="flex-1 text-base font-semibold text-primary">{t.report_ai_title}</h2>
        {!isPro && !checking && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent">{t.report_ai_pro}</span>}
      </div>
      <p className="text-sm text-muted">{t.report_ai_hint}</p>
      <Button className="w-full" onClick={() => void day.askInsight()} loading={day.insightLoading} disabled={checking}>
        {day.insightLoading ? t.report_ai_loading : t.report_ai_cta}
      </Button>
      {upsell && (
        <Link href="/billing?source=daily_report"
          className="inline-block rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90">
          {t.plan_ai_go_pro}
        </Link>
      )}
      {day.insightError !== null && <p aria-live="polite" className="text-sm text-muted">{day.insightError}</p>}
    </div>
  )
}

/**
 * Gün raporu (web): mobildeki raporla aynı model ve aynı kapanış akışı, tek sütun.
 * Tarih istemcide çözülür; sunucu UTC'de çalıştığı için orada "bugün" yanlış gün olabilir.
 */
export function DayReport({ rawDate }: DayReportProps) {
  const { t, lang } = useLang()
  const [today] = useState(todayDate)
  const date = resolveReportDate(rawDate, today)
  const { isPro, loading: checking } = useSubscription()
  const [upsell, setUpsell] = useState(false)
  const day = useDayReport({
    supabase, date, lang,
    requirePro: () => { if (!isPro) setUpsell(true); return isPro },
  })
  const { report, view } = day

  if (day.status !== 'ready' || !report || !view) {
    const missing = day.notFound
    const failed = day.status === 'error'
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <BackLink />
        <div className="glass space-y-3 rounded-2xl p-6 text-center">
          <p className="text-base font-semibold text-primary">
            {missing ? t.report_missing_title : failed ? t.report_error_title : t.report_loading}
          </p>
          {failed && !missing && <p className="text-sm text-muted">{t.report_error_body}</p>}
          {missing && <Link href={`/report?date=${today}`} className="text-sm font-semibold text-accent hover:underline">{t.report_missing_today}</Link>}
          {failed && !missing && (
            <Button variant="secondary" size="sm" onClick={() => void day.refresh()} loading={day.refreshing}>{t.report_retry}</Button>
          )}
        </div>
      </div>
    )
  }

  const narrative = report.narrative
  const empty = report.facts.items.length === 0 && view.habits.length === 0 && !hasVitals(report)

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <BackLink />
      <Hero date={date} report={report} summary={view.summary} stale={day.stale} />

      {empty && (
        <div className="glass space-y-1 rounded-2xl p-5 text-center">
          <p className="text-base font-semibold text-primary">{t.report_empty_title}</p>
          <p className="text-sm text-muted">{t.report_empty_body}</p>
        </div>
      )}

      {view.lines.length > 0 && (
        <section className="space-y-3">
          <SectionTitle label={t.report_sec_well} />
          {view.lines.map((line, index) => (
            <p key={`${index}-${line}`} className="flex items-start gap-3 text-sm text-primary">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                <Check className="h-3 w-3" />
              </span>
              {line}
            </p>
          ))}
        </section>
      )}

      <OpenItems items={view.closure} saveFailed={day.saveFailed}
        onDone={day.markDone} onUndo={day.undoDone} onMark={day.mark} onReason={day.toggleReason} />
      <Postponed rows={view.postponed} />
      <Vitals facts={report.facts} />
      <HabitsWeek habits={view.habits} />
      <Programs rows={view.programs} />

      {narrative?.suggestion?.trim() && (
        <section className="glass space-y-2 rounded-2xl border-l-4 border-l-accent p-4">
          <SectionTitle label={t.report_sec_tomorrow} />
          <p className="text-lg font-semibold text-primary">{narrative.suggestion}</p>
        </section>
      )}
      {narrative?.future_self?.trim() && (
        <section className="space-y-3">
          <SectionTitle label={t.report_sec_future} />
          <p className="text-2xl font-semibold text-primary">{narrative.future_self}</p>
        </section>
      )}

      {!empty && <Insight day={day} isAi={narrative?.source === 'ai'} isPro={isPro} checking={checking} upsell={upsell} />}

      <Link href="/planning" className="block rounded-lg bg-border/50 py-2.5 text-center text-sm font-medium text-primary hover:bg-border">
        {t.report_done_button}
      </Link>
    </div>
  )
}
