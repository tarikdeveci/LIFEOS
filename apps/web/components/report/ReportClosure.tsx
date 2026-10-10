'use client'

// Gün raporunun kapanış bölümleri: açık kalan işler (tek tıkla karar) ve ertelenenler.
import { Check, CheckCircle2, Circle, CircleDashed } from 'lucide-react'
import { fill, type PostponedRow, type SkipReason, type ViewItem } from '@lifeos/shared'
import { useLang } from '@/lib/contexts/LangContext'
import type { Translations } from '@/lib/i18n'

type Mark = 'partial' | 'skipped'

interface OpenItemsProps {
  /** Hâlâ açık olanlar ve bu oturumda dokunulanlar. */
  items: ViewItem[]
  /** Son yazma tutmadı; ekran eski hâline döndü. */
  saveFailed: boolean
  onDone: (key: string) => void
  onUndo: (key: string) => void
  /** Seçili işarete tekrar tıklamak işareti kaldırır. */
  onMark: (key: string, outcome: Mark) => void
  /** Seçili nedene tekrar tıklamak nedeni kaldırır. */
  onReason: (key: string, reason: SkipReason) => void
}

interface ItemCardProps extends Omit<OpenItemsProps, 'items' | 'saveFailed'> {
  item: ViewItem
}

interface PostponedProps { rows: PostponedRow[] }
interface SectionTitleProps { label: string }

const REASONS: SkipReason[] = ['energy', 'time', 'interrupted', 'not_needed', 'avoided']

function reasonLabels(t: Translations): Record<SkipReason, string> {
  return {
    energy: t.report_reason_energy,
    time: t.report_reason_time,
    interrupted: t.report_reason_interrupted,
    not_needed: t.report_reason_not_needed,
    avoided: t.report_reason_avoided,
  }
}

export function SectionTitle({ label }: SectionTitleProps) {
  const { lang } = useLang()
  // CSS uppercase tarayıcı diline bakar; "İyi" doğru büyüsün diye uygulama diliyle büyüt.
  return <h2 className="text-xs font-bold tracking-wider text-subtle">{label.toLocaleUpperCase(lang)}</h2>
}

function ItemCard({ item, onDone, onUndo, onMark, onReason }: ItemCardProps) {
  const { t } = useLang()
  const labels = reasonLabels(t)
  const marked = item.outcome === 'partial' || item.outcome === 'skipped'
  // Manevi ve sayaçsız işte süre, sayı ve "olmadı" seçeneği yok: yalnızca sade bir onay.
  const meta = item.quiet ? '' : [item.start_time, item.minutes ? fill(t.report_minutes, { n: item.minutes }) : null].filter(Boolean).join(' · ')

  if (item.outcome === 'done') {
    return (
      <div className="glass flex items-center gap-3 rounded-2xl px-4 py-2.5">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
        <span className="flex-1 truncate text-sm text-muted">{item.title}</span>
        <button onClick={() => onUndo(item.key)} aria-label={`${item.title}: ${t.report_undo}`}
          className="text-xs font-semibold text-accent hover:underline">
          {t.report_undo}
        </button>
      </div>
    )
  }

  const choice = (label: string, active: boolean, primary: boolean, onClick: () => void) => (
    <button onClick={onClick} aria-pressed={active} aria-label={`${item.title}: ${label}`}
      className={`flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-semibold transition-colors ${
        active ? 'border-accent bg-accent/10 text-accent'
          : primary ? 'border-transparent bg-accent/10 text-accent hover:bg-accent/20'
            : 'border-border text-muted hover:text-primary'}`}>
      {primary && <Check className="h-3.5 w-3.5" />}
      {label}
    </button>
  )

  return (
    <div className="glass space-y-3 rounded-2xl p-4">
      <div>
        <p className="text-sm font-semibold text-primary">{item.title}</p>
        {meta !== '' && <p className="text-xs tabular-nums text-muted">{meta}</p>}
      </div>
      <div className="flex gap-2">
        {choice(t.report_did, false, true, () => onDone(item.key))}
        {!item.quiet && choice(t.report_partial, item.outcome === 'partial', false, () => onMark(item.key, 'partial'))}
        {!item.quiet && choice(t.report_skipped, item.outcome === 'skipped', false, () => onMark(item.key, 'skipped'))}
      </div>
      {marked && (
        <div className="space-y-2">
          <p className="text-xs text-muted">{t.report_reason_hint}</p>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((reason) => {
              const active = item.reason === reason
              return (
                <button key={reason} onClick={() => onReason(item.key, reason)} aria-pressed={active}
                  aria-label={fill(t.report_reason_a11y, { reason: labels[reason] })}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    active ? 'border-accent bg-accent/10 font-semibold text-accent' : 'border-border text-muted hover:text-primary'}`}>
                  {labels[reason]}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Kapanış: raporun tek girdisi. Açık kalan her iş için tek tık (yaptım, yarım, olmadı);
 * neden isteğe bağlı. Karar verilen kart yerinde kalır, böylece karar değiştirilebilir.
 */
export function OpenItems({ items, saveFailed, onDone, onUndo, onMark, onReason }: OpenItemsProps) {
  const { t } = useLang()
  if (items.length === 0) return null
  const allClosed = items.every((i) => i.outcome !== 'open')

  return (
    <section className="space-y-3">
      <div>
        <SectionTitle label={t.report_sec_open} />
        <p aria-live="polite" className="text-sm text-muted">{allClosed ? t.report_all_closed : t.report_open_hint}</p>
      </div>
      {items.map((item) => (
        <ItemCard key={item.key} item={item} onDone={onDone} onUndo={onUndo} onMark={onMark} onReason={onReason} />
      ))}
      {saveFailed && <p aria-live="polite" className="text-sm text-muted">{t.report_save_error}</p>}
    </section>
  )
}

/** Ertelenenler: sade liste. Renk ve dil nötr; neden varsa cümlesiyle birlikte. */
export function Postponed({ rows }: PostponedProps) {
  const { t } = useLang()
  if (rows.length === 0) return null
  const reasonNote: Record<SkipReason, string> = {
    energy: t.report_note_energy,
    time: t.report_note_time,
    interrupted: t.report_note_interrupted,
    not_needed: t.report_note_not_needed,
    avoided: t.report_note_avoided,
  }

  return (
    <section className="space-y-3">
      <SectionTitle label={t.report_sec_postponed} />
      {rows.map((row) => {
        const outcome = row.outcome === 'partial' ? t.report_outcome_partial : t.report_outcome_skipped
        const detail = row.note ?? (row.reason ? `${outcome}. ${reasonNote[row.reason]}` : `${outcome}.`)
        const Icon = row.outcome === 'partial' ? CircleDashed : Circle
        return (
          <div key={row.key} className="flex items-start gap-3">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
            <div>
              <p className="text-sm font-semibold text-primary">{row.title}</p>
              <p className="text-sm text-muted">{detail}</p>
            </div>
          </div>
        )
      })}
    </section>
  )
}
