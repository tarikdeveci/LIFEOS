'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  lifeSetupGoalMeta,
  lifeSetupRoutineMeta,
  lifeSetupRuleKeys,
  lifeSetupRuleText,
  lifeSetupTaskMeta,
  useLifeSetup,
} from '@lifeos/shared'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase/client'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { useLang } from '@/lib/contexts/LangContext'

interface LifeSetupModalProps {
  open: boolean
  /** Vazgeçildi: önceki pencereye dön. */
  onClose: () => void
  /** Öneri uygulandı: tüm pencereler kapanır. */
  onDone: () => void
  userId: string
}

type Tone = 'accent' | 'success' | 'warning'
interface RowBadge { label: string; tone: Tone }

const TONE: Record<Tone, string> = {
  accent: 'border-accent text-accent',
  success: 'border-success text-success',
  warning: 'border-warning text-warning',
}

interface RowProps {
  title: string
  meta?: string
  checked: boolean
  locked: boolean
  onChange: () => void
  badges?: RowBadge[]
}

function Row({ title, meta, checked, locked, onChange, badges = [] }: RowProps) {
  return (
    <label className={`flex items-start gap-2 rounded-lg bg-background px-2 py-1.5 ${locked ? 'opacity-70' : 'cursor-pointer'}`}>
      <input type="checkbox" className="mt-0.5" checked={checked} disabled={locked} onChange={onChange} />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-medium ${checked ? 'text-primary' : 'text-muted'}`}>{title}</span>
        {meta && <span className="block text-xs text-muted">{meta}</span>}
        {badges.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            {badges.map((b) => (
              <span key={b.label} className={`rounded-full border px-2 text-[10px] font-medium ${TONE[b.tone]}`}>{b.label}</span>
            ))}
          </span>
        )}
      </span>
    </label>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { lang } = useLang()
  return (
    <section className="space-y-1.5">
      <h3 className="text-[11px] font-semibold tracking-wide text-muted">{title.toLocaleUpperCase(lang)}</h3>
      {children}
    </section>
  )
}

/** Hayat planımı kur: serbest metin, AI önerisi, tek onay ekranı, uygula. Mobildeki LifeSetupSheet'in web karşılığı. */
export function LifeSetupModal({ open, onClose, onDone, userId }: LifeSetupModalProps) {
  const { t, lang } = useLang()
  const { isPro } = useSubscription()
  const [upsell, setUpsell] = useState(false)
  const ls = useLifeSetup({
    supabase, userId, lang, t, onDone,
    requirePro: () => { if (!isPro) setUpsell(true); return isPro },
  })
  const applying = ls.busy === 'apply'
  const { proposal, selection, written } = ls
  const strings: Record<string, string> = t
  const saved: RowBadge = { label: t.setup_written, tone: 'success' }

  function close() {
    if (applying) return
    ls.reset()
    setUpsell(false)
    onClose()
  }

  const ruleKeys = proposal ? lifeSetupRuleKeys(proposal) : []

  return (
    <Modal open={open} onClose={close} title={t.setup_title} size="lg">
      {proposal === null || selection === null || written === null ? (
        <div className="space-y-3">
          <p className="text-xs text-muted">{t.setup_hint}</p>
          <textarea
            value={ls.text}
            onChange={(e) => ls.setText(e.target.value)}
            maxLength={ls.textMax}
            rows={8}
            disabled={ls.busy !== null}
            placeholder={t.setup_placeholder}
            className="w-full rounded-xl border border-border bg-surface p-3 text-sm text-primary"
          />
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted">
              {t.setup_counter.replace('{n}', String(ls.text.length)).replace('{max}', String(ls.textMax))}
            </span>
            {ls.busy === 'ai' && <span className="text-xs text-muted">{t.setup_loading}</span>}
            <div className="flex-1" />
            <Button size="sm" onClick={() => void ls.extract()} disabled={!ls.text.trim() || ls.busy !== null} loading={ls.busy === 'ai'}>
              ✨ {t.setup_extract}
            </Button>
          </div>
          {upsell && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5">
              <p className="text-xs text-indigo-800">{t.setup_pro_needed}</p>
              <Link href="/billing?source=life_setup"
                className="mt-2 inline-block rounded-lg bg-indigo-500 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-indigo-600">
                {t.plan_ai_go_pro}
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-muted">{t.setup_review_hint}</p>
          {proposal.summary !== '' && <p className="text-sm text-primary">{proposal.summary}</p>}
          {proposal.routines.length + proposal.goals.length + proposal.tasks.length + ruleKeys.length === 0 && (
            <p className="text-sm text-muted">{t.setup_empty}</p>
          )}

          <div className="max-h-[50vh] space-y-4 overflow-y-auto">
            {proposal.routines.length > 0 && (
              <Section title={t.setup_sec_routines}>
                {proposal.routines.map((r, i) => (
                  <Row
                    key={`r${i}`}
                    title={r.title}
                    meta={lifeSetupRoutineMeta(r, strings)}
                    checked={selection.routines[i] ?? false}
                    locked={applying || !!written.routines[i]}
                    onChange={() => ls.toggle('routines', i)}
                    badges={[
                      ...(r.is_protected ? [{ label: t.setup_protected, tone: 'accent' as const }] : []),
                      ...(r.is_untracked ? [{ label: t.setup_untracked, tone: 'accent' as const }] : []),
                      ...(written.routines[i] ? [saved] : []),
                    ]}
                  />
                ))}
              </Section>
            )}

            {proposal.goals.length > 0 && (
              <Section title={t.setup_sec_goals}>
                {proposal.goals.map((g, i) => (
                  <Row
                    key={`g${i}`}
                    title={g.title}
                    meta={lifeSetupGoalMeta(g, strings)}
                    checked={selection.goals[i] ?? false}
                    locked={applying || (written.goals[i] ?? 0) > 0}
                    onChange={() => ls.toggle('goals', i)}
                    badges={written.goals[i] === 2 ? [saved] : written.goals[i] === 1 ? [{ label: t.setup_goal_partial, tone: 'warning' }] : []}
                  />
                ))}
              </Section>
            )}

            {proposal.tasks.length > 0 && (
              <Section title={t.setup_sec_tasks}>
                {proposal.tasks.map((task, i) => (
                  <Row
                    key={`t${i}`}
                    title={task.title}
                    meta={lifeSetupTaskMeta(task, strings)}
                    checked={selection.tasks[i] ?? false}
                    locked={applying || !!written.tasks[i]}
                    onChange={() => ls.toggle('tasks', i)}
                    badges={written.tasks[i] ? [saved] : []}
                  />
                ))}
              </Section>
            )}

            {ruleKeys.length > 0 && (
              <Section title={t.setup_sec_rules}>
                {ruleKeys.map((key) => (
                  <Row
                    key={key}
                    title={lifeSetupRuleText(proposal, key, strings)}
                    checked={selection.rules[key] ?? false}
                    locked={applying || !!written.rules[key]}
                    onChange={() => ls.toggleRule(key)}
                    badges={written.rules[key] ? [saved] : []}
                  />
                ))}
              </Section>
            )}

            {proposal.unsupported.length > 0 && (
              <Section title={t.setup_sec_unsupported}>
                <div className="space-y-1 rounded-lg border border-border p-3">
                  <p className="text-xs text-muted">{t.setup_unsupported_note}</p>
                  {proposal.unsupported.map((item, i) => (
                    <p key={i} className="text-sm text-primary">{`• ${item}`}</p>
                  ))}
                </div>
              </Section>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={ls.backToText} disabled={applying}>{t.setup_back}</Button>
            <div className="flex-1" />
            <Button size="sm" onClick={() => void ls.apply()} disabled={ls.remaining === 0 || applying} loading={applying}>
              {ls.remaining === 0 ? t.setup_nothing_selected : (ls.wroteSome ? t.setup_apply_rest : t.setup_apply).replace('{n}', String(ls.remaining))}
            </Button>
          </div>
        </div>
      )}
      {ls.error && <p className="mt-2 text-xs text-danger">{ls.error}</p>}
    </Modal>
  )
}
